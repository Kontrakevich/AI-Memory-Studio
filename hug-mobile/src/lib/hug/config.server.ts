import { getCookie } from "@tanstack/react-start/server";

export const OPENROUTER_SESSION_COOKIE = "__Host-hug_openrouter";
export const SUPABASE_SESSION_COOKIE = "__Host-hug_supabase_service";
export const DEFAULT_SUPABASE_URL =
  "https://c--825ece70-e980-4526-a153-234fd8808d39-prod.lovable.cloud";

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

export type SupabaseServerConfig = {
  url: string;
  serviceRoleKey: string | null;
  connected: boolean;
};

const env = (key: string) => {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
};

const num = (key: string, fallback: number) => {
  const parsed = Number(env(key));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function getHugConfig(): HugConfig {
  // Production env secret wins. Otherwise use the per-browser HttpOnly session secret.
  // The cookie is readable only on the server and is never returned to client code.
  const apiKey = env("OPENROUTER_API_KEY") ?? getCookie(OPENROUTER_SESSION_COOKIE) ?? null;

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

export function getSupabaseServerConfig(): SupabaseServerConfig {
  const url = env("SUPABASE_URL") ?? DEFAULT_SUPABASE_URL;
  const serviceRoleKey =
    env("SUPABASE_SERVICE_ROLE_KEY") ?? getCookie(SUPABASE_SESSION_COOKIE) ?? null;

  return {
    url,
    serviceRoleKey,
    connected: Boolean(url && serviceRoleKey),
  };
}
