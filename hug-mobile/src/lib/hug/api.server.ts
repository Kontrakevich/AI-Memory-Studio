import { getHugConfig } from "./config.server";
import { NanoBananaProvider, SeedanceProvider, base64ToBytes } from "./providers.server";
import { loadJob, logEvent, retryStage, runStage, toView } from "./orchestrator.server";
import {
  blobConfigured,
  createJobState,
  patchJobState,
  readDiagnostics,
  uploadAsset,
  type StoredJob,
} from "./storage.server";
import type { DiagnosticEvent, JobView } from "./types";

function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) throw new Error("Ожидается изображение в формате data URL");
  const contentType = match[1]!;
  const bytes = base64ToBytes(match[2]!);
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("Изображение больше 25 МБ");
  return { contentType, bytes };
}

function extension(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("heic") || contentType.includes("heif")) return "heic";
  return "jpg";
}

export async function createJobImpl(input: {
  schoolImage: string;
  adultImage: string;
  testMode: boolean;
}): Promise<JobView> {
  if (!blobConfigured()) {
    throw new Error("Vercel Blob не подключен к проекту. Добавь Blob Store в Vercel → hug-mobile → Storage.");
  }

  const config = getHugConfig();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const school = decodeDataUrl(input.schoolImage);
  const adult = decodeDataUrl(input.adultImage);

  const schoolPath = await uploadAsset(
    id,
    `school_identity.${extension(school.contentType)}`,
    school.bytes,
    school.contentType,
  );
  const adultPath = await uploadAsset(
    id,
    `adult_identity.${extension(adult.contentType)}`,
    adult.bytes,
    adult.contentType,
  );

  const row: StoredJob = {
    id,
    status: "created",
    current_stage: "school_analysis",
    mode: config.live ? "live" : "mock",
    test_mode: input.testMode,
    analyses: {},
    plan: {},
    assets: {
      school_identity: {
        path: schoolPath,
        contentType: school.contentType,
        createdAt: now,
      },
      adult_identity: {
        path: adultPath,
        contentType: adult.contentType,
        createdAt: now,
      },
    },
    passport: null,
    qc: {},
    approvals: { master: null, meeting: null },
    attempts: {},
    provider_jobs: {},
    stage_states: {},
    error: null,
    created_at: now,
    updated_at: now,
  };

  await createJobState(row);
  await logEvent(id, "intake", "info", "job created", {
    mode: config.live ? "live" : "mock",
    test_mode: input.testMode,
    school_bytes: school.bytes.byteLength,
    adult_bytes: adult.bytes.byteLength,
    storage: "vercel_blob",
  });

  return toView(await loadJob(id));
}

export async function getJobImpl(jobId: string) {
  return toView(await loadJob(jobId));
}

export async function advanceJobImpl(jobId: string) {
  return runStage(jobId);
}

export async function retryJobImpl(jobId: string) {
  return retryStage(jobId);
}

export async function setApprovalImpl(input: {
  jobId: string;
  target: "master" | "meeting";
  approved: boolean;
}) {
  const row = await loadJob(input.jobId);
  const approvals = { ...(row.approvals ?? {}), [input.target]: input.approved };
  const patch: Partial<StoredJob> = { approvals };

  if (input.approved) {
    patch.status = "running";
  } else {
    patch.current_stage = input.target === "master" ? "master_frame" : "meeting_frame";
    patch.status = "running";
  }

  await patchJobState(input.jobId, patch);
  await logEvent(
    input.jobId,
    `${input.target}_approval`,
    "info",
    input.approved ? "approved" : "rejected",
  );
  return toView(await loadJob(input.jobId));
}

export async function diagnosticsImpl(jobId: string): Promise<DiagnosticEvent[]> {
  return readDiagnostics(jobId);
}

export type Capabilities = {
  mode: "live" | "mock";
  baseUrl: string;
  models: { analysis: string; image: string; video: string };
  thresholds: Record<string, number>;
  checks: { name: string; ok: boolean; detail: string }[];
};

export async function capabilitiesImpl(): Promise<Capabilities> {
  const config = getHugConfig();
  const checks: Capabilities["checks"] = [
    {
      name: "OPENROUTER_API_KEY",
      ok: config.live,
      detail: config.live ? "секрет настроен на сервере" : "не задан — MOCK",
    },
    {
      name: "VERCEL_BLOB",
      ok: blobConfigured(),
      detail: blobConfigured() ? "private storage подключено" : "Blob Store не подключен",
    },
  ];

  if (config.live) {
    for (const [name, fn] of [
      ["GET /images/models", () => new NanoBananaProvider().capabilities()],
      ["GET /videos/models", () => new SeedanceProvider().capabilities()],
    ] as const) {
      try {
        await fn();
        checks.push({ name, ok: true, detail: "доступно" });
      } catch (error) {
        checks.push({
          name,
          ok: false,
          detail: error instanceof Error ? error.message : "ошибка",
        });
      }
    }
  }

  return {
    mode: config.live ? "live" : "mock",
    baseUrl: config.baseUrl,
    models: config.models,
    thresholds: config.qcThresholds,
    checks,
  };
}
