import { getHugConfig } from "./config.server";
import { OpenRouterTransport, type TransportResult } from "./transport.server";
export type ImageInput={dataUrl:string;label:string};
export type ProviderCall<T>={result:T;meta:Record<string,unknown>};
function fail(where:string,res:TransportResult<unknown>):never{const body=res.data as {error?:{message?:string}}|null;throw new Error(`${where}: ${body?.error?.message??res.raw??`HTTP ${res.status}`}`)}
export class AnalysisProvider{constructor(private transport=new OpenRouterTransport()){}async analyze(prompt:string,images:ImageInput[]):Promise<ProviderCall<Record<string,unknown>>>{const model=getHugConfig().models.analysis;const content:unknown[]=[{type:"text",text:prompt}];for(const i of images)content.push({type:"text",text:`[${i.label}]`},{type:"image_url",image_url:{url:i.dataUrl}});const res=await this.transport.request<{choices?:{message?:{content?:string}}[]}>("/chat/completions",{body:{model,messages:[{role:"user",content}],temperature:.1,response_format:{type:"json_object"}}});if(!res.ok||!res.data)fail("AnalysisProvider",res);return{result:parseJsonLoose(res.data.choices?.[0]?.message?.content??""),meta:{provider:"AnalysisProvider",model,...res.meta}}}}
export function parseJsonLoose(text:string):Record<string,unknown>{const t=text.trim().replace(/^```(?:json)?/i,"").replace(/```$/,"");try{return JSON.parse(t)}catch{const s=t.indexOf("{"),e=t.lastIndexOf("}");if(s>=0&&e>s)try{return JSON.parse(t.slice(s,e+1))}catch{}return{raw_text:t.slice(0,2000),parse_error:true}}}
export class NanoBananaProvider{constructor(private transport=new OpenRouterTransport()){}async capabilities(){const r=await this.transport.request<unknown>("/images/models");if(!r.ok)fail("NanoBananaProvider.capabilities",r);return r.data}async generate(prompt:string,references:ImageInput[]):Promise<ProviderCall<{bytes:Uint8Array;contentType:string}>>{const c=getHugConfig(),model=c.models.image;const body:Record<string,unknown>={model,prompt,aspect_ratio:c.aspectRatio,resolution:"2K",quality:"high",output_format:"png",n:1};if(references.length)body["input_references"]=references.map(r=>({type:"image_url",image_url:{url:r.dataUrl}}));const res=await this.transport.request<{data?:{b64_json?:string;media_type?:string;url?:string}[]}>("/images",{body});if(!res.ok||!res.data)fail("NanoBananaProvider",res);const item=res.data.data?.[0];if(!item)throw new Error("NanoBananaProvider: no image returned");let bytes:Uint8Array;if(item.b64_json)bytes=base64ToBytes(item.b64_json);else if(item.url){const rr=await fetch(item.url);if(!rr.ok)throw new Error("NanoBananaProvider: image URL download failed");bytes=new Uint8Array(await rr.arrayBuffer())}else throw new Error("NanoBananaProvider: response has no b64_json/url");return{result:{bytes,contentType:item.media_type??"image/png"},meta:{provider:"NanoBananaProvider",model,...res.meta}}}}
export type VideoJob={jobId:string;pollingUrl?:string;usage?:Record<string,unknown>};
export class SeedanceProvider{
  constructor(private transport=new OpenRouterTransport()){}
  async capabilities(){const r=await this.transport.request<unknown>("/videos/models");if(!r.ok)fail("SeedanceProvider.capabilities",r);return r.data}
  async submit(prompt:string,firstFrame:ImageInput,references:ImageInput[]):Promise<ProviderCall<VideoJob>>{
    const c=getHugConfig(),model=c.models.video;
    const lastFrame=references.find((r)=>r.label==="MEETING_REFERENCE_FRAME");
    const frameImages:unknown[]=[{type:"image_url",image_url:{url:firstFrame.dataUrl},frame_type:"first_frame"}];
    if(lastFrame)frameImages.push({type:"image_url",image_url:{url:lastFrame.dataUrl},frame_type:"last_frame"});
    const res=await this.transport.request<{id?:string;polling_url?:string;usage?:Record<string,unknown>}>("/videos",{body:{model,prompt,duration:c.videoDurationSeconds,resolution:"720p",aspect_ratio:c.aspectRatio,generate_audio:false,frame_images:frameImages}});
    if(!res.ok||!res.data){
      const raw=String(res.raw??"");
      if(raw.includes("InputImageSensitiveContentDetected")||raw.includes("PrivacyInformation"))throw new Error("SeedanceProvider.submit: Seedance отклонил один из подготовленных MASTER/MEETING кадров по фильтру приватности. Сырые SCHOOL_IDENTITY и ADULT_IDENTITY в video-запрос не отправляются.");
      fail("SeedanceProvider.submit",res);
    }
    if(!res.data.id)throw new Error("SeedanceProvider: no video job id returned");
    return{result:{jobId:res.data.id,...(res.data.polling_url?{pollingUrl:res.data.polling_url}:{}),...(res.data.usage?{usage:res.data.usage}:{})},meta:{provider:"SeedanceProvider",model,video_input_mode:lastFrame?"first_last_frame":"first_frame_only",raw_identity_references_sent:false,...res.meta}}
  }
  async poll(job:VideoJob):Promise<ProviderCall<{status:string;error?:string;unsignedUrls?:string[];usage?:Record<string,unknown>}>>{const r=await this.transport.request<{status?:string;error?:{message?:string};unsigned_urls?:string[];usage?:Record<string,unknown>}>(job.pollingUrl??`/videos/${encodeURIComponent(job.jobId)}`);if(!r.ok||!r.data)fail("SeedanceProvider.poll",r);return{result:{status:r.data.status??"unknown",...(r.data.error?.message?{error:r.data.error.message}:{}),...(r.data.unsigned_urls?{unsignedUrls:r.data.unsigned_urls}:{}),...(r.data.usage?{usage:r.data.usage}:{})},meta:{provider:"SeedanceProvider",...r.meta}}}
  async content(job:VideoJob,unsignedUrl?:string){const r=await this.transport.requestBinary(unsignedUrl??`/videos/${encodeURIComponent(job.jobId)}/content?index=0`);if(!r.ok||!r.bytes)throw new Error(`SeedanceProvider.content: HTTP ${r.status}`);return{bytes:r.bytes,contentType:r.contentType||"video/mp4"}}
}
export function base64ToBytes(base64:string){const b=atob(base64);const bytes=new Uint8Array(b.length);for(let i=0;i<b.length;i++)bytes[i]=b.charCodeAt(i);return bytes}
export function bytesToBase64(bytes:Uint8Array){let binary="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary)}
