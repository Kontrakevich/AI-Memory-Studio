import { createClient } from "@supabase/supabase-js";
let client:ReturnType<typeof createClient>|undefined;
export function getSupabaseAdmin(){if(client)return client;const url=process.env["SUPABASE_URL"],key=process.env["SUPABASE_SERVICE_ROLE_KEY"];if(!url||!key)throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});return client;}
export const supabaseAdmin=new Proxy({} as ReturnType<typeof createClient>,{get(_,prop){return Reflect.get(getSupabaseAdmin(),prop)}});
