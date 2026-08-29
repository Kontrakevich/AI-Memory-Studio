import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Capabilities } from "./hug/api.server";
import type { DiagnosticEvent, JobView } from "./hug/types";

const jobIdSchema = z.object({ jobId: z.string().uuid() });
const createSchema = z.object({
  schoolImage: z.string().min(32),
  adultImage: z.string().min(32),
  testMode: z.boolean().default(false),
});
const approvalSchema = z.object({
  jobId: z.string().uuid(),
  target: z.enum(["master", "meeting"]),
  approved: z.boolean(),
});
const openRouterSecretSchema = z.object({
  apiKey: z.string().trim().min(20).max(512),
});
const supabaseSecretSchema = z.object({
  serviceRoleKey: z.string().trim().min(20).max(2048),
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
    const { OPENROUTER_SESSION_COOKIE } = await import("./hug/config.server");

    setCookie(OPENROUTER_SESSION_COOKIE, data.apiKey, {
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

export const setHugSupabaseSecret = createServerFn({ method: "POST" })
  .validator((data: unknown) => supabaseSecretSchema.parse(data))
  .handler(async ({ data }): Promise<{ connected: true }> => {
    const { setCookie } = await import("@tanstack/react-start/server");
    const { SUPABASE_SESSION_COOKIE } = await import("./hug/config.server");

    setCookie(SUPABASE_SESSION_COOKIE, data.serviceRoleKey, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return { connected: true };
  });

export const clearHugSupabaseSecret = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ connected: false }> => {
    const { setCookie } = await import("@tanstack/react-start/server");
    const { SUPABASE_SESSION_COOKIE } = await import("./hug/config.server");

    setCookie(SUPABASE_SESSION_COOKIE, "", {
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
