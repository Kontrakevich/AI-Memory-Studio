import { getHugConfig, getSupabaseServerConfig } from "./config.server";
import { NanoBananaProvider, SeedanceProvider, base64ToBytes } from "./providers.server";
import { loadJob, logEvent, retryStage, runStage, toView } from "./orchestrator.server";
import { admin, uploadAsset } from "./storage.server";
import type { DiagnosticEvent, JobView } from "./types";

function decodeDataUrl(dataUrl:string){const m=/^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());if(!m)throw new Error("Ожидается изображение в формате data URL");const contentType=m[1]!,bytes=base64ToBytes(m[2]!);if(bytes.byteLength>25*1024*1024)throw new Error("Изображение больше 25 МБ");return{contentType,bytes}}
export async function createJobImpl(input:{schoolImage:string;adultImage:string;testMode:boolean}):Promise<JobView>{const config=getHugConfig(),client=await admin();const{data,error}=await client.from("hug_jobs").insert({status:"created",current_stage:"school_analysis",mode:config.live?"live":"mock",test_mode:input.testMode}).select("*").single();if(error||!data)throw new Error(error?.message??"Не удалось создать задачу");const id=(data as any).id as string,school=decodeDataUrl(input.schoolImage),adult=decodeDataUrl(input.adultImage);const ext=(t:string)=>t.includes("png")?"png":t.includes("webp")?"webp":t.includes("heic")||t.includes("heif")?"heic":"jpg";const schoolPath=await uploadAsset(id,`school_identity.${ext(school.contentType)}`,school.bytes,school.contentType),adultPath=await uploadAsset(id,`adult_identity.${ext(adult.contentType)}`,adult.bytes,adult.contentType);await client.from("hug_jobs").update({school_path:schoolPath,adult_path:adultPath,assets:{school_identity:{path:schoolPath,contentType:school.contentType},adult_identity:{path:adultPath,contentType:adult.contentType}}}).eq("id",id);await logEvent(id,"intake","info","job created",{mode:config.live?"live":"mock",test_mode:input.testMode,school_bytes:school.bytes.byteLength,adult_bytes:adult.bytes.byteLength});return toView(await loadJob(id))}
export async function getJobImpl(jobId:string){return toView(await loadJob(jobId))}
export async function advanceJobImpl(jobId:string){return runStage(jobId)}
export async function retryJobImpl(jobId:string){return retryStage(jobId)}
export async function setApprovalImpl(input:{jobId:string;target:"master"|"meeting";approved:boolean}){const row=await loadJob(input.jobId),approvals={...(row.approvals??{}),[input.target]:input.approved},client=await admin();const patch:Record<string,unknown>={approvals};if(input.approved)patch.status="running";else{patch.current_stage=input.target==="master"?"master_frame":"meeting_frame";patch.status="running"}await client.from("hug_jobs").update(patch).eq("id",input.jobId);await logEvent(input.jobId,`${input.target}_approval`,"info",input.approved?"approved":"rejected");return toView(await loadJob(input.jobId))}
export async function diagnosticsImpl(jobId:string):Promise<DiagnosticEvent[]>{const client=await admin();const{data,error}=await client.from("hug_events").select("*").eq("job_id",jobId).order("created_at",{ascending:false}).limit(100);if(error)throw new Error(error.message);return(data??[]) as unknown as DiagnosticEvent[]}
export type Capabilities={mode:"live"|"mock";baseUrl:string;models:{analysis:string;image:string;video:string};thresholds:Record<string,number>;checks:{name:string;ok:boolean;detail:string}[]};
export async function capabilitiesImpl():Promise<Capabilities>{
  const c=getHugConfig(),db=getSupabaseServerConfig();
  const checks:Capabilities["checks"]=[
    {name:"OPENROUTER_API_KEY",ok:c.live,detail:c.live?"секрет настроен на сервере":"не задан — MOCK"},
    {name:"SUPABASE_SERVER",ok:db.connected,detail:db.connected?"server key настроен":"server key не задан"},
  ];
  if(c.live){for(const [name,fn] of [["GET /images/models",()=>new NanoBananaProvider().capabilities()],["GET /videos/models",()=>new SeedanceProvider().capabilities()]] as const){try{await fn();checks.push({name,ok:true,detail:"доступно"})}catch(e){checks.push({name,ok:false,detail:e instanceof Error?e.message:"ошибка"})}}}
  if(db.connected){try{const client=await admin();const{error}=await client.from("hug_jobs").select("id").limit(1);if(error)throw new Error(error.message);checks.push({name:"SUPABASE_DB",ok:true,detail:"hug_jobs доступна"})}catch(e){checks.push({name:"SUPABASE_DB",ok:false,detail:e instanceof Error?e.message:"ошибка подключения"})}}
  return{mode:c.live?"live":"mock",baseUrl:c.baseUrl,models:c.models,thresholds:c.qcThresholds,checks};
}
