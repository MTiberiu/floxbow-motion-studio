import {z} from 'zod';
const id=z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100);
export const clipSchema=z.object({id,trackId:id,componentId:id,label:z.string().max(200),from:z.number().int().nonnegative(),durationInFrames:z.number().int().positive(),content:z.record(z.string(),z.json()).default({}),props:z.record(z.string(),z.json()).default({})});
export const editTimelineSchema=z.object({version:z.literal(1),fps:z.number().int().min(1).max(120),durationInFrames:z.number().int().min(1).max(216000),tracks:z.array(z.object({id,name:z.string().min(1).max(100)})).min(1).max(32),clips:z.array(clipSchema).max(3000)}).superRefine((t,ctx)=>{
 const tracks=new Set(t.tracks.map(t=>t.id));const clips=new Set(t.clips.map(c=>c.id));
 if(tracks.size!==t.tracks.length||clips.size!==t.clips.length)ctx.addIssue({code:'custom',message:'Duplicate track or clip IDs'});
 for(const c of t.clips){if(!tracks.has(c.trackId))ctx.addIssue({code:'custom',message:`Unknown track: ${c.trackId}`});if(c.from+c.durationInFrames>t.durationInFrames)ctx.addIssue({code:'custom',message:`Clip ${c.id} exceeds project duration`});}
});
export type EditTimeline=z.infer<typeof editTimelineSchema>;
export type TimelineClip=z.infer<typeof clipSchema>;
export const fieldSchema=z.object({key:id,label:z.string().max(100),target:z.enum(['content','props']).default('props'),type:z.enum(['text','number','color','select','boolean']),default:z.union([z.string(),z.number(),z.boolean()]),min:z.number().optional(),max:z.number().optional(),step:z.number().positive().optional(),options:z.array(z.string()).max(50).optional()});
export const componentInfoSchema=z.object({id,name:z.string().max(100),fields:z.array(fieldSchema).max(50)});
export const componentInfosSchema=z.array(componentInfoSchema).max(100);
export type ComponentInfo=z.infer<typeof componentInfoSchema>;
export type EditableField=z.infer<typeof fieldSchema>;
export function parseEditTimeline(input:unknown,expected?:{fps:number;durationInFrames:number}){const t=editTimelineSchema.parse(input);if(expected&&(t.fps!==expected.fps||t.durationInFrames!==expected.durationInFrames))throw new Error('Timeline FPS and duration must match project.json');return t;}
/** Moving carries word offsets. Trimming preserves the absolute position of spoken words. */
export function changeClipRange(t:EditTimeline,id:string,from:number,end:number,trim=false):EditTimeline{
 const next=structuredClone(t);const c=next.clips.find(c=>c.id===id);if(!c)return t;
 from=Math.max(0,Math.min(t.durationInFrames-1,Math.round(from)));end=Math.max(from+1,Math.min(t.durationInFrames,Math.round(end)));
 if(trim&&Array.isArray(c.content.words)){const delta=(c.from-from)/t.fps;c.content.words=c.content.words.map(w=>{if(w&&typeof w==='object'&&!Array.isArray(w)&&typeof w.start==='number'&&typeof w.end==='number')return {...w,start:w.start+delta,end:w.end+delta};return w;});}
 c.from=from;c.durationInFrames=end-from;if(c.content.status&&c.content.status!=='demo')c.content.status='unverified';return parseEditTimeline(next);
}
export function fieldValue(clip:TimelineClip,field:EditableField){return clip[field.target][field.key]??field.default;}
export function validateField(field:EditableField,value:unknown){
 if(field.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||(field.min!==undefined&&value<field.min)||(field.max!==undefined&&value>field.max))throw new Error(`Invalid ${field.label}`);}
 else if(field.type==='boolean'){if(typeof value!=='boolean')throw new Error(`Invalid ${field.label}`);}
 else {if(typeof value!=='string'||value.length>20000)throw new Error(`Invalid ${field.label}`);if(field.type==='select'&&!field.options?.includes(value))throw new Error(`Invalid ${field.label}`);if(field.type==='color'&&!/^#[0-9a-f]{6}$/i.test(value))throw new Error(`Invalid ${field.label}`);}
 return value as string|number|boolean;
}
