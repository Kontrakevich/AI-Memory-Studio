export type Json = string|number|boolean|null|Json[]|{[key:string]:Json};
export const STAGES=["school_analysis","adult_analysis","memory_space_plan","master_frame","master_qc","meeting_frame","meeting_qc","video","video_qc","final_frame"] as const;
export type Stage=(typeof STAGES)[number];
export type StageState={status:"pending"|"running"|"done"|"error"|"awaiting_approval";startedAt?:string;finishedAt?:string;error?:string;attempts?:number};
export type JobStatus="created"|"running"|"awaiting_approval"|"error"|"completed";
export type AssetRef={path:string;contentType:string;mock?:boolean;createdAt?:string};
export type QcRecord={passed:boolean;scores:Record<string,number>;notes?:string;threshold:number;model?:string;createdAt?:string};
export type FramePassport={camera_position?:string;camera_height?:string;yaw?:string;pitch?:string;roll?:string;focal_description?:string;horizon?:string;crop?:string;geometry?:string;furniture_relationships?:string;light_direction?:string;[key:string]:Json|undefined};
export type JobView={id:string;status:JobStatus;current_stage:Stage|"done";mode:"live"|"mock";test_mode:boolean;stage_states:Partial<Record<Stage,StageState>>;assets:Partial<Record<string,AssetRef>>;qc:Partial<Record<string,QcRecord>>;approvals:{master?:boolean|null;meeting?:boolean|null};passport:FramePassport|null;analyses:Record<string,Json>;plan:Record<string,Json>;provider_jobs:Record<string,Json>;attempts:Record<string,number>;error:{stage?:string;message?:string}|null;created_at:string;updated_at:string;urls:Partial<Record<string,string>>};
export type DiagnosticEvent={id:string;stage:string;level:string;message:string;attempt:number;provider:string|null;model:string|null;details:Record<string,Json>;created_at:string};
export const STAGE_GROUPS=[
{key:"restore",label:"Восстанавливаем тебя из прошлого",stages:["school_analysis"]},
{key:"space",label:"Раскрываем пространство школьной фотографии",stages:["memory_space_plan"]},
{key:"adult",label:"Определяем твой современный образ",stages:["adult_analysis"]},
{key:"meeting",label:"Готовим встречу",stages:["master_frame","master_qc","meeting_frame","meeting_qc"]},
{key:"hug",label:"Создаем объятие прошлого и настоящего",stages:["video","video_qc"]},
{key:"moment",label:"Выбираем лучший момент",stages:["final_frame"]}
] as {key:string;label:string;stages:Stage[]}[];
