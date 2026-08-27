export const ACTIVE_JOB_KEY = "hug.activeJobId";
export const TEST_MODE_KEY = "hug.testMode";

// Preserve the original full-resolution identity source. Do not resize or redraw it in canvas.
export async function fileToDataUrl(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Фото больше 25 МБ. Выберите исходник меньшего размера без скриншота.");
  return await new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(new Error("Не удалось прочитать файл")); reader.readAsDataURL(file); });
}
export function readLocal(key:string){ if(typeof window==="undefined")return null; try{return window.localStorage.getItem(key)}catch{return null} }
export function writeLocal(key:string,value:string|null){ if(typeof window==="undefined")return; try{value===null?window.localStorage.removeItem(key):window.localStorage.setItem(key,value)}catch{} }
