import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Capabilities } from "./hug/api.server";
import type { DiagnosticEvent, JobView } from "./hug/types";

const jobIdSchema = z.object({ jobId: z.string().uuid() });
const intakeAssetSchema = z.object({
  path: z.string().min(24).max(512),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  size: z.number().int().positive().max(25 * 1024 * 1024),
});
const createSchema = z.object({
  schoolAsset: intakeAssetSchema,
  adultAsset: intakeAssetSchema,
  testMode: z.boolean().default(false),
});
const inputUploadSchema = z.object({
  slot: z.enum(["school", "adult"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  size: z.number().int().positive().max(25 * 1024 * 1024),
});
const approvalSchema = z.object({
  jobId: z.string().uuid(),
  target: z.enum(["master", "meeting"]),
  approved: z.boolean(),
});
const openRouterSecretSchema = z.object({
  apiKey: z.string().trim().min(20).max(512),
});

export const createHugInputUpload = createServerFn({ method: "POST" })
  .validator((data: unknown) => inputUploadSchema.parse(data))
  .handler(async ({ data }): Promise<{
    uploadUrl: string;
    pathname: string;
    contentType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
    maxSizeBytes: number;
  }> => {
    const { createInputUploadTicket } = await import("./hug/storage.server");
    return createInputUploadTicket(data);
  });

export const createHugJob = createServerFn({ method: "POST" })
  .validator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }): Promise<JobView> => {
    const { createJobImpl } = await import("./hug/api.server");
    return createJobImpl(data);
  });

export const getHugJob = createServerFn({ method: "GET" })
  .validator((data: unknown) => jobIdSchema.parse(data))
  .handler(async ({ data }): Promise<JobView> => {
    const { getJobImpl } = await import("./hug/api.server");
    return getJobImpl(data.jobId);
  });

export const advanceHugJob = createServerFn({ method: "POST" })
  .validator((data: unknown) => jobIdSchema.parse(data))
  .handler(async ({ data }): Promise<JobView> => {
    const { advanceJobImpl } = await import("./hug/api.server");
    return advanceJobImpl(data.jobId);
  });

export const retryHugStage = createServerFn({ method: "POST" })
  .validator((data: unknown) => jobIdSchema.parse(data))
  .handler(async ({ data }): Promise<JobView> => {
    const { retryJobImpl } = await import("./hug/api.server");
    return retryJobImpl(data.jobId);
  });

export const setHugApproval = createServerFn({ method: "POST" })
  .validator((data: unknown) => approvalSchema.parse(data))
  .handler(async ({ data }): Promise<JobView> => {
    const { setApprovalImpl } = await import("./hug/api.server");
    return setApprovalImpl(data);
  });

export const getHugDiagnostics = createServerFn({ method: "GET" })
  .validator((data: unknown) => jobIdSchema.parse(data))
  .handler(async ({ data }): Promise<DiagnosticEvent[]> => {
    const { diagnosticsImpl } = await import("./hug/api.server");
    return diagnosticsImpl(data.jobId);
  });

export const setHugOpenRouterSecret = createServerFn({ method: "POST" })
  .validator((data: unknown) => openRouterSecretSchema.parse(data))
  .handler(async ({ data }): Promise<{ connected: true }> => {
    const { setCookie } = await import("@tanstack/react-start/server");
    const { OPENROUTER_SESSION_COOKIE, normalizeOpenRouterKey } = await import("./hug/config.server");
    const normalized = normalizeOpenRouterKey(data.apiKey);

    if (!normalized || !normalized.startsWith("sk-or-")) {
      throw new Error("Ключ OpenRouter имеет неверный формат. Нужен ключ, начинающийся с sk-or-.");
    }

    setCookie(OPENROUTER_SESSION_COOKIE, normalized, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return { connected: true };
  });

export const clearHugOpenRouterSecret = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ connected: false }> => {
    const { setCookie } = await import("@tanstack/react-start/server");
    const { OPENROUTER_SESSION_COOKIE } = await import("./hug/config.server");

    setCookie(OPENROUTER_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });

    return { connected: false };
  },
);

export const getHugCapabilities = createServerFn({ method: "GET" }).handler(
  async (): Promise<Capabilities> => {
    const { capabilitiesImpl } = await import("./hug/api.server");
    return capabilitiesImpl();
  },
);
