import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Capabilities } from "./hug/api.server";
import type { DiagnosticEvent, JobView } from "./hug/types";

const jobIdSchema=z.object({jobId:z.string().uuid()});
export const createHugJob=createServerFn({method:"POST"}).inputValidator((d:unknown)=>z.object({schoolImage:z.string().min(32),adultImage:z.string().min(32),testMode:z.boolean().default(false)}).parse(d)).handler(async({data}):Promise<JobView>=>{const{createJobImpl}=await import("./hug/api.server");return createJobImpl(data)});
export const getHugJob=createServerFn({method:"GET"}).inputValidator((d:unknown)=>jobIdSchema.parse(d)).handler(async({data}):Promise<JobView>=>{const{getJobImpl}=await import("./hug/api.server");return getJobImpl(data.jobId)});
export const advanceHugJob=createServerFn({method:"POST"}).inputValidator((d:unknown)=>jobIdSchema.parse(d)).handler(async({data}):Promise<JobView>=>{const{advanceJobImpl}=await import("./hug/api.server");return advanceJobImpl(data.jobId)});
export const retryHugStage=createServerFn({method:"POST"}).inputValidator((d:unknown)=>jobIdSchema.parse(d)).handler(async({data}):Promise<JobView>=>{const{retryJobImpl}=await import("./hug/api.server");return retryJobImpl(data.jobId)});
export const setHugApproval=createServerFn({method:"POST"}).inputValidator((d:unknown)=>z.object({jobId:z.string().uuid(),target:z.enum(["master","meeting"]),approved:z.boolean()}).parse(d)).handler(async({data}):Promise<JobView>=>{const{setApprovalImpl}=await import("./hug/api.server");return setApprovalImpl(data)});
export const getHugDiagnostics=createServerFn({method:"GET"}).inputValidator((d:unknown)=>jobIdSchema.parse(d)).handler(async({data}):Promise<DiagnosticEvent[]>=>{const{diagnosticsImpl}=await import("./hug/api.server");return diagnosticsImpl(data.jobId)});
export const getHugCapabilities=createServerFn({method:"GET"}).handler(async():Promise<Capabilities>=>{const{capabilitiesImpl}=await import("./hug/api.server");return capabilitiesImpl()});
