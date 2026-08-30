import { getCookie } from "@tanstack/react-start/server";

export const OPENROUTER_SESSION_COOKIE = "__Host-hug_openrouter";

export type HugConfig = {
  baseUrl: string;
  apiKey: string | null;
  live: boolean;
  models: { analysis: string; image: string; video: string };
  qcThresholds: { master: number; meeting: number; video: number };
  maxAttemptsPerStage: number;
  videoDurationSeconds: number;
  aspectRatio: string;
};

const env = (key: string) => {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
};

const num = (key: string, fallback: number) => {
  const parsed = Number(env(key));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function normalizeOpenRouterKey(value: string | null | undefined) {
  let key = value?.trim() ?? "";
  key = key.replace(/^OPENROUTER_API_KEY\s*=\s*/i, "").trim();
  key = key.replace(/^Bearer\s+/i, "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  // OpenRouter keys are `sk-or-v1-` plus 64 hexadecimal characters.
  // Some password managers / copy flows can preserve only the 64-character body.
  // Recover that unambiguous case automatically without exposing or logging the secret.
  if (/^[0-9a-f]{64}$/i.test(key)) {
    key = `sk-or-v1-${key}`;
  }

  return key || null;
}

export function getHugConfig(): HugConfig {
  const apiKey = normalizeOpenRouterKey(
    env("OPENROUTER_API_KEY") ?? getCookie(OPENROUTER_SESSION_COOKIE) ?? null,
  );

  return {
    baseUrl: env("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
    apiKey,
    live: Boolean(apiKey),
    models: {
      analysis: env("HUG_ANALYSIS_MODEL") ?? "google/gemini-2.5-flash",
      image: env("HUG_IMAGE_MODEL") ?? "google/gemini-3-pro-image",
      video: env("HUG_VIDEO_MODEL") ?? "bytedance/seedance-2.0",
    },
    qcThresholds: {
      master: num("HUG_QC_MASTER_THRESHOLD", 0.7),
      meeting: num("HUG_QC_MEETING_THRESHOLD", 0.7),
      video: num("HUG_QC_VIDEO_THRESHOLD", 0.65),
    },
    maxAttemptsPerStage: num("HUG_MAX_ATTEMPTS", 2),
    videoDurationSeconds: num("HUG_VIDEO_SECONDS", 15),
    aspectRatio: env("HUG_ASPECT_RATIO") ?? "9:16",
  };
}
