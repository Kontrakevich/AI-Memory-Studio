import { get, issueSignedToken, presignUrl, put } from "@vercel/blob";
import { bytesToBase64 } from "./providers.server";
import type { AssetRef, DiagnosticEvent, JobView, QcRecord, Stage } from "./types";

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export type StoredJob = {
  id: string;
  status: JobView["status"];
  current_stage: Stage | "done";
  mode: "live" | "mock";
  test_mode: boolean;
  analyses: Record<string, any>;
  plan: Record<string, any>;
  assets: Record<string, AssetRef>;
  passport: Record<string, any> | null;
  qc: Record<string, QcRecord>;
  approvals: { master?: boolean | null; meeting?: boolean | null };
  attempts: Record<string, number>;
  provider_jobs: Record<string, any>;
  stage_states: Record<string, any>;
  error: { stage?: string; message?: string } | null;
  created_at: string;
  updated_at: string;
};

type BlobAuthOptions = {
  token?: string;
  oidcToken?: string;
  storeId?: string;
};

const ROOT = "hug/jobs";
const INPUT_ROOT = "hug/intake";
const statePath = (jobId: string) => `${ROOT}/${jobId}/state.json`;
const diagnosticsPath = (jobId: string) => `${ROOT}/${jobId}/diagnostics.json`;
const assetPath = (jobId: string, name: string) => `${ROOT}/${jobId}/assets/${name}`;

function blobAuth(): BlobAuthOptions {
  const token = process.env["BLOB_READ_WRITE_TOKEN"];
  if (token) return { token };

  const storeId = process.env["BLOB_STORE_ID"];
  if (storeId) {
    return { storeId };
  }

  return {};
}

export function blobConfigured() {
  return Boolean(process.env["BLOB_READ_WRITE_TOKEN"] || process.env["BLOB_STORE_ID"]);
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic" || contentType === "image/heif") return "heic";
  return "jpg";
}

export async function createInputUploadTicket(input: {
  slot: "school" | "adult";
  contentType: string;
  size: number;
}) {
  if (!blobConfigured()) {
    throw new Error("Vercel Blob не подключён к production-проекту.");
  }
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > MAX_INPUT_BYTES) {
    throw new Error("Размер фото недопустим. Максимум — 25 МБ на один исходник.");
  }

  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]);
  const contentType = input.contentType.trim().toLowerCase();
  if (!allowed.has(contentType)) {
    throw new Error("Поддерживаются JPEG, PNG, WebP, HEIC и HEIF.");
  }

  const uploadId = crypto.randomUUID();
  const pathname = `${INPUT_ROOT}/${uploadId}/${input.slot}.${extensionForContentType(contentType)}`;
  const validUntil = Date.now() + 10 * 60 * 1000;

  const signedToken = await issueSignedToken({
    pathname,
    operations: ["put"],
    validUntil,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_INPUT_BYTES,
    ...blobAuth(),
  });

  const { presignedUrl } = await presignUrl(signedToken, {
    operation: "put",
    pathname,
    access: "private",
    validUntil,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_INPUT_BYTES,
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  return {
    uploadUrl: presignedUrl,
    pathname,
    contentType,
    maxSizeBytes: MAX_INPUT_BYTES,
  };
}

async function readJson<T>(pathname: string): Promise<T | null> {
  const result = await get(pathname, {
    access: "private",
    useCache: false,
    ...blobAuth(),
  });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as T;
}

async function writeJson(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    ...blobAuth(),
  });
}

export async function createJobState(row: StoredJob) {
  await writeJson(statePath(row.id), row);
  return row;
}

export async function loadJobState(jobId: string): Promise<StoredJob> {
  const row = await readJson<StoredJob>(statePath(jobId));
  if (!row) throw new Error("Job not found");
  return row;
}

export async function patchJobState(jobId: string, patch: Partial<StoredJob>) {
  const current = await loadJobState(jobId);
  const next: StoredJob = {
    ...current,
    ...patch,
    id: current.id,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
  };
  await writeJson(statePath(jobId), next);
  return next;
}

export async function uploadAsset(jobId: string, name: string, bytes: Uint8Array, contentType: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const pathname = assetPath(jobId, name);
  const blob = await put(pathname, copy.buffer, {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType,
    multipart: bytes.byteLength > 4 * 1024 * 1024,
    ...blobAuth(),
  });
  return blob.pathname;
}

export async function downloadDataUrl(pathname: string) {
  const result = await get(pathname, {
    access: "private",
    useCache: false,
    ...blobAuth(),
  });
  if (!result || result.statusCode !== 200) throw new Error(`Blob not found: ${pathname}`);
  const buffer = new Uint8Array(await new Response(result.stream).arrayBuffer());
  return `data:${result.blob.contentType || "application/octet-stream"};base64,${bytesToBase64(buffer)}`;
}

export async function signedUrlsForAssets(assets: Record<string, AssetRef>) {
  const urls: Record<string, string> = {};
  const entries = Object.entries(assets).filter(([, asset]) => Boolean(asset?.path));
  if (!entries.length) return urls;

  const token = await issueSignedToken({
    pathname: "*",
    operations: ["get"],
    validUntil: Date.now() + 15 * 60 * 1000,
    ...blobAuth(),
  });

  for (const [key, asset] of entries) {
    const { presignedUrl } = await presignUrl(token, {
      operation: "get",
      pathname: asset.path,
      access: "private",
      validUntil: Date.now() + 10 * 60 * 1000,
    });
    urls[key] = presignedUrl;
  }

  return urls;
}

export async function writeDiagnostic(jobId: string, event: Omit<DiagnosticEvent, "id" | "created_at">) {
  const current = (await readJson<DiagnosticEvent[]>(diagnosticsPath(jobId))) ?? [];
  const nextEvent: DiagnosticEvent = {
    ...event,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  await writeJson(diagnosticsPath(jobId), [nextEvent, ...current].slice(0, 200));
  return nextEvent;
}

export async function readDiagnostics(jobId: string) {
  return (await readJson<DiagnosticEvent[]>(diagnosticsPath(jobId))) ?? [];
}
