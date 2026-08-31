import { getHugConfig } from "./config.server";
import { NanoBananaProvider, SeedanceProvider } from "./providers.server";
import { loadJob, logEvent, retryStage, runStage, toView } from "./orchestrator.server";
import {
  MAX_INPUT_BYTES,
  blobConfigured,
  createJobState,
  patchJobState,
  readDiagnostics,
  type StoredJob,
} from "./storage.server";
import { OpenRouterTransport } from "./transport.server";
import type { DiagnosticEvent, JobView } from "./types";

type IntakeAsset = {
  path: string;
  contentType: string;
  size: number;
};

function validateIntakeAsset(slot: "school" | "adult", asset: IntakeAsset) {
  if (!asset.path.startsWith("hug/intake/")) {
    throw new Error("Исходное фото не принадлежит защищённому хранилищу HUG.");
  }
  const expected = new RegExp(
    `^hug/intake/[0-9a-f-]{36}/${slot}\\.(?:jpg|png|webp|heic)$`,
    "i",
  );
  if (!expected.test(asset.path)) {
    throw new Error(`Неверный путь исходника: ${slot}. Загрузите фото заново.`);
  }
  if (!asset.contentType.startsWith("image/")) {
    throw new Error(`Файл ${slot} не распознан как изображение.`);
  }
  if (!Number.isFinite(asset.size) || asset.size <= 0 || asset.size > MAX_INPUT_BYTES) {
    throw new Error(`Размер исходника ${slot} недопустим.`);
  }
}

export async function createJobImpl(input: {
  schoolAsset: IntakeAsset;
  adultAsset: IntakeAsset;
  testMode: boolean;
}): Promise<JobView> {
  if (!blobConfigured()) {
    throw new Error("Vercel Blob не подключен к проекту. Добавь Blob Store в Vercel → hug-mobile → Storage.");
  }

  validateIntakeAsset("school", input.schoolAsset);
  validateIntakeAsset("adult", input.adultAsset);

  const config = getHugConfig();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

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
        path: input.schoolAsset.path,
        contentType: input.schoolAsset.contentType,
        createdAt: now,
      },
      adult_identity: {
        path: input.adultAsset.path,
        contentType: input.adultAsset.contentType,
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
  await logEvent(id, "intake", "info", "job created from direct blob uploads", {
    mode: config.live ? "live" : "mock",
    test_mode: input.testMode,
    school_bytes: input.schoolAsset.size,
    adult_bytes: input.adultAsset.size,
    storage: "vercel_blob_direct_upload",
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
  const row = await loadJob(jobId);

  if (row.current_stage === "video") {
    const providerJobs = { ...(row.provider_jobs ?? {}) } as Record<string, unknown>;
    delete providerJobs.video;
    delete providerJobs.video_provider;
    delete providerJobs.video_model;
    delete providerJobs.video_submit_meta;
    delete providerJobs.video_usage;

    await patchJobState(jobId, {
      provider_jobs: providerJobs,
      status: "running",
      error: null,
    });

    await logEvent(jobId, "video", "info", "stale video provider job cleared before manual retry", {
      preserved_assets: ["master_first_frame", "meeting_reference_frame"],
      raw_identity_references_sent: false,
    });
  }

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
  const build = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  const keyChars = config.apiKey?.length ?? 0;
  const keyFormatOk = Boolean(config.apiKey?.startsWith("sk-or-"));
  const checks: Capabilities["checks"] = [
    {
      name: "BACKEND_VERSION",
      ok: true,
      detail: build,
    },
    {
      name: "OPENROUTER_API_KEY",
      ok: config.live,
      detail: config.live ? "ключ найден в защищённой серверной сессии" : "не задан — MOCK",
    },
    {
      name: "OPENROUTER_KEY_FORMAT",
      ok: keyFormatOk,
      detail: config.live
        ? `формат ${keyFormatOk ? "корректный" : "неверный"}; длина ${keyChars} символов`
        : "ключ отсутствует",
    },
    {
      name: "VERCEL_BLOB",
      ok: blobConfigured(),
      detail: blobConfigured() ? "private storage подключено" : "Blob Store не подключен",
    },
  ];

  if (config.live) {
    try {
      const auth = await new OpenRouterTransport(config.apiKey).request<unknown>("/key");
      if (auth.ok) {
        checks.push({
          name: "OPENROUTER_AUTH",
          ok: true,
          detail: `защищённый запрос подтверждён; transport=${auth.meta.transport}`,
        });
      } else {
        const body = auth.data as { error?: { message?: string } } | null;
        const message = body?.error?.message ?? auth.raw ?? `HTTP ${auth.status}`;
        checks.push({
          name: "OPENROUTER_AUTH",
          ok: false,
          detail: `${message}; transport=${auth.meta.transport}; Authorization=${auth.meta.authHeaderSent ? "добавлен" : "не добавлен"}; HTTP=${auth.status}`,
        });
      }
    } catch (error) {
      checks.push({
        name: "OPENROUTER_AUTH",
        ok: false,
        detail: error instanceof Error ? error.message : "ошибка авторизации",
      });
    }

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
