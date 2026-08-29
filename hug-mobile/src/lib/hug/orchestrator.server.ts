import { getHugConfig } from "./config.server";
import {
  AnalysisProvider,
  NanoBananaProvider,
  SeedanceProvider,
  type ImageInput,
  type VideoJob,
} from "./providers.server";
import { sanitize } from "./transport.server";
import { mockAnalysis, mockImage, mockQc } from "./mock.server";
import {
  downloadDataUrl,
  loadJobState,
  patchJobState,
  signedUrlsForAssets,
  uploadAsset,
  writeDiagnostic,
  type StoredJob,
} from "./storage.server";
import {
  ADULT_ANALYSIS_PROMPT,
  FRAME_PASSPORT_PROMPT,
  MASTER_QC_PROMPT,
  MEETING_QC_PROMPT,
  SCHOOL_ANALYSIS_PROMPT,
  VIDEO_QC_PROMPT,
  masterFramePrompt,
  meetingFramePrompt,
  memorySpacePlanPrompt,
  videoPrompt,
} from "./prompts.server";
import { STAGES, type JobView, type QcRecord, type Stage } from "./types";

export type JobRow = StoredJob;

export async function logEvent(
  jobId: string,
  stage: string,
  level: "info" | "error" | "warn",
  message: string,
  details: Record<string, unknown> = {},
  provider?: string,
  model?: string,
  attempt = 1,
) {
  try {
    await writeDiagnostic(jobId, {
      stage,
      level,
      message: message.slice(0, 1000),
      attempt,
      provider: provider ?? null,
      model: model ?? null,
      details: sanitize(details) as any,
    });
  } catch (error) {
    console.error("[hug] diagnostics", error);
  }
}

export async function loadJob(jobId: string): Promise<JobRow> {
  return loadJobState(jobId);
}

async function saveJob(id: string, patch: Partial<JobRow>) {
  return patchJobState(id, patch);
}

export async function toView(row: JobRow): Promise<JobView> {
  const urls = await signedUrlsForAssets(row.assets ?? {});
  return {
    id: row.id,
    status: row.status,
    current_stage: row.current_stage,
    mode: row.mode,
    test_mode: row.test_mode,
    stage_states: row.stage_states as JobView["stage_states"],
    assets: row.assets,
    qc: row.qc,
    approvals: row.approvals,
    passport: row.passport as JobView["passport"],
    analyses: row.analyses as JobView["analyses"],
    plan: row.plan as JobView["plan"],
    provider_jobs: row.provider_jobs as JobView["provider_jobs"],
    attempts: row.attempts,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    urls,
  };
}

const nextStage = (stage: Stage): Stage | "done" => {
  const index = STAGES.indexOf(stage);
  return index < 0 || index === STAGES.length - 1 ? "done" : STAGES[index + 1]!;
};

async function ref(row: JobRow, key: string, label: string): Promise<ImageInput> {
  const path = row.assets?.[key]?.path;
  if (!path) throw new Error(`missing asset for ${key}`);
  return { dataUrl: await downloadDataUrl(path), label };
}

function qcFrom(raw: Record<string, unknown>, threshold: number, model: string): QcRecord {
  const scores = (raw.scores ?? {}) as Record<string, number>;
  const values = Object.values(scores).filter((value) => typeof value === "number");
  return {
    passed: values.length > 0 && Math.min(...values) >= threshold,
    scores,
    threshold,
    model,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    createdAt: new Date().toISOString(),
  };
}

export async function runStage(jobId: string): Promise<JobView> {
  const row = await loadJob(jobId);
  if (row.current_stage === "done") return toView(row);

  const stage = row.current_stage as Stage;
  const cfg = getHugConfig();
  const attempt = (row.attempts?.[stage] ?? 0) + 1;

  if (stage === "meeting_frame" && row.test_mode && row.approvals.master !== true) {
    await saveJob(jobId, { status: "awaiting_approval" });
    return toView(await loadJob(jobId));
  }
  if (stage === "video" && row.test_mode && row.approvals.meeting !== true) {
    await saveJob(jobId, { status: "awaiting_approval" });
    return toView(await loadJob(jobId));
  }

  const states = {
    ...row.stage_states,
    [stage]: { status: "running", startedAt: new Date().toISOString(), attempts: attempt },
  };
  await saveJob(jobId, {
    status: "running",
    stage_states: states,
    attempts: { ...row.attempts, [stage]: attempt },
    error: null,
  });

  try {
    const patch = await executeStage(row, stage, cfg.live);
    const finished = {
      ...states,
      [stage]: { status: "done", finishedAt: new Date().toISOString(), attempts: attempt },
    };
    const advance = patch.__hold === true ? stage : nextStage(stage);
    delete patch.__hold;

    await saveJob(jobId, {
      ...(patch as Partial<JobRow>),
      stage_states: finished,
      current_stage: advance,
      status:
        advance === "done"
          ? "completed"
          : row.test_mode && (advance === "meeting_frame" || advance === "video")
            ? "awaiting_approval"
            : "running",
    });
    await logEvent(jobId, stage, "info", "stage completed", { attempt, next: advance });
    return toView(await loadJob(jobId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = {
      ...states,
      [stage]: {
        status: "error",
        finishedAt: new Date().toISOString(),
        error: message,
        attempts: attempt,
      },
    };
    await saveJob(jobId, {
      status: "error",
      stage_states: failed,
      error: { stage, message },
    });
    await logEvent(jobId, stage, "error", message, {
      attempt,
      assets: Object.keys(row.assets ?? {}),
      mode: row.mode,
    });
    return toView(await loadJob(jobId));
  }
}

async function executeStage(row: JobRow, stage: Stage, live: boolean): Promise<Record<string, any>> {
  const cfg = getHugConfig();
  const analysis = new AnalysisProvider();
  const banana = new NanoBananaProvider();
  const seedance = new SeedanceProvider();
  const attempt = (row.attempts?.[stage] ?? 0) + 1;

  const putAsset = async (key: string, bytes: Uint8Array, contentType: string, mock: boolean) => {
    const ext = contentType.includes("svg")
      ? "svg"
      : contentType.includes("mp4")
        ? "mp4"
        : contentType.includes("jpeg")
          ? "jpg"
          : "png";
    const path = await uploadAsset(row.id, `${key}.${ext}`, bytes, contentType);
    return {
      assets: {
        ...row.assets,
        [key]: { path, contentType, mock, createdAt: new Date().toISOString() },
      },
    };
  };

  switch (stage) {
    case "school_analysis": {
      if (!live) return { analyses: { ...row.analyses, school: mockAnalysis("school") } };
      const out = await analysis.analyze(SCHOOL_ANALYSIS_PROMPT, [
        await ref(row, "school_identity", "SCHOOL_IDENTITY"),
      ]);
      return { analyses: { ...row.analyses, school: out.result } };
    }
    case "adult_analysis": {
      if (!live) return { analyses: { ...row.analyses, adult: mockAnalysis("adult") } };
      const out = await analysis.analyze(ADULT_ANALYSIS_PROMPT, [
        await ref(row, "adult_identity", "ADULT_IDENTITY"),
      ]);
      return { analyses: { ...row.analyses, adult: out.result } };
    }
    case "memory_space_plan": {
      if (!live) return { plan: mockAnalysis("memory_space_plan") };
      const out = await analysis.analyze(
        memorySpacePlanPrompt(row.analyses.school, row.analyses.adult),
        [],
      );
      return { plan: out.result };
    }
    case "master_frame": {
      if (!live) {
        const image = mockImage("MASTER_FIRST_FRAME", "ребёнок в школьном кадре");
        return putAsset("master_first_frame", image.bytes, image.contentType, true);
      }
      const out = await banana.generate(masterFramePrompt(row.plan, row.analyses.school), [
        await ref(row, "school_identity", "SCHOOL_IDENTITY"),
      ]);
      await logEvent(
        row.id,
        stage,
        "info",
        "master frame generated",
        out.meta,
        "NanoBananaProvider",
        cfg.models.image,
        attempt,
      );
      return putAsset("master_first_frame", out.result.bytes, out.result.contentType, false);
    }
    case "master_qc": {
      if (!live) {
        return {
          qc: {
            ...row.qc,
            master: mockQc(
              [
                "child_identity",
                "memory_continuity",
                "environment_reconstruction",
                "era_authenticity",
                "composition",
              ],
              cfg.qcThresholds.master,
            ),
          },
          passport: { mock: true },
        };
      }
      const school = await ref(row, "school_identity", "SCHOOL_IDENTITY");
      const master = await ref(row, "master_first_frame", "MASTER_FIRST_FRAME");
      const qcOut = await analysis.analyze(MASTER_QC_PROMPT, [school, master]);
      const record = qcFrom(qcOut.result, cfg.qcThresholds.master, cfg.models.analysis);
      const passport = await analysis.analyze(FRAME_PASSPORT_PROMPT, [master]);
      return { qc: { ...row.qc, master: record }, passport: passport.result };
    }
    case "meeting_frame": {
      if (!live) {
        const image = mockImage("MEETING_REFERENCE_FRAME", "взрослый входит справа");
        return putAsset("meeting_reference_frame", image.bytes, image.contentType, true);
      }
      const refs = [
        await ref(row, "master_first_frame", "MASTER_FIRST_FRAME"),
        await ref(row, "adult_identity", "ADULT_IDENTITY"),
        await ref(row, "school_identity", "SCHOOL_IDENTITY"),
      ];
      const out = await banana.generate(meetingFramePrompt(row.passport, row.analyses.adult), refs);
      return putAsset("meeting_reference_frame", out.result.bytes, out.result.contentType, false);
    }
    case "meeting_qc": {
      if (!live) {
        return {
          qc: {
            ...row.qc,
            meeting: mockQc(
              ["adult_identity", "child_preservation", "environment_consistency", "scale"],
              cfg.qcThresholds.meeting,
            ),
          },
        };
      }
      const out = await analysis.analyze(MEETING_QC_PROMPT, [
        await ref(row, "master_first_frame", "MASTER_FIRST_FRAME"),
        await ref(row, "meeting_reference_frame", "MEETING_REFERENCE_FRAME"),
        await ref(row, "adult_identity", "ADULT_IDENTITY"),
      ]);
      const record = qcFrom(out.result, cfg.qcThresholds.meeting, cfg.models.analysis);
      return { qc: { ...row.qc, meeting: record } };
    }
    case "video": {
      if (!live) {
        const image = mockImage("FINAL_VIDEO_MOCK", "OpenRouter key required for real video");
        return putAsset("final_video", image.bytes, image.contentType, true);
      }

      const jobs = { ...row.provider_jobs } as Record<string, any>;
      let job = jobs.video as VideoJob | undefined;
      if (!job) {
        const master = await ref(row, "master_first_frame", "MASTER_FIRST_FRAME");
        const meeting = await ref(row, "meeting_reference_frame", "MEETING_REFERENCE_FRAME");
        const school = await ref(row, "school_identity", "SCHOOL_IDENTITY");
        const adult = await ref(row, "adult_identity", "ADULT_IDENTITY");
        const submitted = await seedance.submit(videoPrompt(row.passport), master, [
          meeting,
          school,
          adult,
        ]);
        job = submitted.result;
        jobs.video = job;
        await saveJob(row.id, { provider_jobs: jobs });
        await logEvent(
          row.id,
          stage,
          "info",
          "video job submitted",
          { job_id: job.jobId, polling_url: job.pollingUrl ?? null },
          "SeedanceProvider",
          cfg.models.video,
          attempt,
        );
      }

      let polled;
      try {
        polled = await seedance.poll(job);
      } catch (error) {
        await logEvent(row.id, stage, "warn", "video polling transient failure", {
          job_id: job.jobId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { __hold: true, provider_jobs: jobs };
      }

      const status = polled.result.status.toLowerCase();
      if (["failed", "cancelled", "expired"].includes(status)) {
        throw new Error(`video generation failed: ${polled.result.error ?? status}`);
      }
      if (!["completed", "succeeded", "success", "done"].includes(status)) {
        return { __hold: true, provider_jobs: jobs };
      }

      jobs.video_usage = polled.result.usage ?? null;
      const content = await seedance.content(job, polled.result.unsignedUrls?.[0]);
      return {
        provider_jobs: jobs,
        ...(await putAsset("final_video", content.bytes, content.contentType, false)),
      };
    }
    case "video_qc": {
      if (!live) {
        return {
          qc: {
            ...row.qc,
            video: mockQc(
              [
                "child_identity",
                "adult_identity",
                "environment_camera_consistency",
                "temporal_continuity",
                "hug_anatomy",
                "final_frame_quality",
              ],
              cfg.qcThresholds.video,
            ),
          },
        };
      }
      const out = await analysis.analyze(VIDEO_QC_PROMPT, [
        await ref(row, "master_first_frame", "MASTER_FIRST_FRAME"),
        await ref(row, "meeting_reference_frame", "MEETING_REFERENCE_FRAME"),
      ]);
      const record = qcFrom(out.result, cfg.qcThresholds.video, cfg.models.analysis);
      return { qc: { ...row.qc, video: record } };
    }
    case "final_frame": {
      if (!live) {
        const image = mockImage("HUG_FINAL_FRAME", "объятие");
        return putAsset("hug_final_frame", image.bytes, image.contentType, true);
      }
      const out = await banana.generate(
        `Produce HUG_FINAL_FRAME: stable final embrace, identical camera/crop/geometry/light. Preserve both identities. FRAME_PASSPORT=${JSON.stringify(row.passport)}`,
        [
          await ref(row, "meeting_reference_frame", "MEETING_REFERENCE_FRAME"),
          await ref(row, "school_identity", "SCHOOL_IDENTITY"),
          await ref(row, "adult_identity", "ADULT_IDENTITY"),
        ],
      );
      return putAsset("hug_final_frame", out.result.bytes, out.result.contentType, false);
    }
    default:
      throw new Error(`unknown stage ${stage}`);
  }
}

export async function retryStage(jobId: string) {
  const row = await loadJob(jobId);
  await saveJob(jobId, { status: "running", error: null });
  await logEvent(jobId, row.current_stage, "info", "manual retry");
  return runStage(jobId);
}
