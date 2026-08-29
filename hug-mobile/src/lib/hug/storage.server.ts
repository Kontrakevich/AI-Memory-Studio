import { bytesToBase64 } from "./providers.server";
const BUCKET="hug-assets";
export async function admin(){const {getSupabaseAdminClient}=await import("@/integrations/supabase/client.server");return getSupabaseAdminClient()}
export async function uploadAsset(jobId:string,name:string,bytes:Uint8Array,contentType:string){const client=await admin(),path=`${jobId}/${name}`;const {error}=await client.storage.from(BUCKET).upload(path,bytes as unknown as ArrayBuffer,{contentType,upsert:true});if(error)throw new Error(`storage upload failed: ${error.message}`);return path}
export async function signedUrl(path:string,seconds=3600){const client=await admin();const {data,error}=await client.storage.from(BUCKET).createSignedUrl(path,seconds);return error||!data?null:data.signedUrl}
export async function downloadDataUrl(path:string){const client=await admin();const {data,error}=await client.storage.from(BUCKET).download(path);if(error||!data)throw new Error(`storage download failed: ${error?.message??path}`);return`data:${data.type||"image/jpeg"};base64,${bytesToBase64(new Uint8Array(await data.arrayBuffer()))}`}
