import {z} from 'zod';
import {parseEditTimeline,type EditTimeline,type TimelineClip} from '@motion/sdk/timeline';

export const mascotPropsSchema=z.object({
  motion:z.enum(['idle','walk','jump','dance','spin','wave']).default('idle'),
  color:z.string().regex(/^#[0-9a-f]{6}$/i).default('#76d4ec'),
  accent:z.string().regex(/^#[0-9a-f]{6}$/i).default('#f8c86d'),
  x:z.number().min(-40).max(140).default(50),
  y:z.number().min(-40).max(140).default(58),
  startX:z.number().min(-40).max(140).optional(),
  endX:z.number().min(-40).max(140).optional(),
  startY:z.number().min(-40).max(140).optional(),
  endY:z.number().min(-40).max(140).optional(),
  easing:z.enum(['linear','ease-in-out']).default('linear'),
  scale:z.number().min(0.4).max(2).default(1),
  speed:z.number().min(0.25).max(4).default(1),
  consumerId:z.union([z.literal(''),z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100)]).default(''),
  speechClipId:z.union([z.literal(''),z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100)]).default(''),
  bubble:z.boolean().default(true),
});
export type MascotProps=z.infer<typeof mascotPropsSchema>;
export type MascotMotion=MascotProps['motion'];

export function addMascot(timeline:EditTimeline,input:{
  id:string;trackId:string;from:number;durationInFrames:number;
  label?:string;props?:Partial<MascotProps>
}):EditTimeline {
  const props=mascotPropsSchema.parse(input.props??{});
  const clip:TimelineClip={
    id:input.id,trackId:input.trackId,componentId:'mascot-2p5d',
    label:input.label??'Mascot',from:input.from,
    durationInFrames:input.durationInFrames,content:{},props,
  };
  return parseEditTimeline({...timeline,clips:[...timeline.clips,clip]});
}
export function removeMascot(timeline:EditTimeline,id:string):EditTimeline {
  return parseEditTimeline({...timeline,clips:timeline.clips.filter(c=>!(c.id===id&&c.componentId==='mascot-2p5d'))});
}
/** The speaking window is defined only by the referenced subtitle clip; never by generated timing. */
export function speechAtFrame(timeline:EditTimeline,clipId:string,absoluteFrame:number) {
  const clip=timeline.clips.find(c=>c.id===clipId&&c.componentId==='subtitles');
  if(!clip||absoluteFrame<clip.from||absoluteFrame>=clip.from+clip.durationInFrames)
    return {speaking:false,text:'',word:'',wordTimed:false};
  const text=typeof clip.content.text==='string'?clip.content.text:'';
  const offset=(absoluteFrame-clip.from)/timeline.fps;
  const words=Array.isArray(clip.content.words)?clip.content.words:[];
  const active=words.find(w=>{if(!w||typeof w!=='object'||Array.isArray(w))return false;
    const item=w as Record<string,unknown>;
    return typeof item.start==='number'&&typeof item.end==='number'&&offset>=item.start&&offset<item.end;
  });
  const word=active&&!Array.isArray(active)&&typeof (active as Record<string,unknown>).text==='string'?String((active as Record<string,unknown>).text):'';
  return {speaking:true,text,word,wordTimed:!!active};
}

/** AI-facing choreography builder. Each step is an ordinary editable timeline clip. */
export const choreographyStepSchema=z.object({
  motion:mascotPropsSchema.shape.motion,
  durationInFrames:z.number().int().positive(),
  x:z.number().min(-40).max(140).optional(),
  y:z.number().min(-40).max(140).optional(),
  endX:z.number().min(-40).max(140).optional(),
  endY:z.number().min(-40).max(140).optional(),
  speed:z.number().min(0.25).max(4).optional(),
  label:z.string().min(1).max(100).optional(),
});
export type ChoreographyStep=z.input<typeof choreographyStepSchema>;
export function composeMascotDance(timeline:EditTimeline,input:{
  idPrefix:string;trackId:string;startFrame:number;
  steps:ChoreographyStep[];props?:Partial<MascotProps>;
}):EditTimeline {
  if(!/^[a-zA-Z0-9_-]{1,70}$/.test(input.idPrefix))throw new Error('Invalid choreography ID');
  if(!Number.isInteger(input.startFrame)||input.startFrame<0)throw new Error('Invalid start frame');
  if(input.steps.length===0||input.steps.length>48)throw new Error('Choreography needs 1-48 steps');
  let cursor=input.startFrame;
  let result=timeline;
  const base=mascotPropsSchema.parse(input.props??{});
  let currentX=base.endX??base.startX??base.x;
  let currentY=base.endY??base.startY??base.y;
  input.steps.forEach((raw,index)=>{
    const step=choreographyStepSchema.parse(raw);
    const startX=step.x??currentX;
    const startY=step.y??currentY;
    const endX=step.endX??startX;
    const endY=step.endY??startY;
    const props={...base,motion:step.motion,x:startX,y:startY,startX,endX,startY,endY,speed:step.speed??base.speed};
    currentX=endX;
    currentY=endY;
    result=addMascot(result,{
      id:`${input.idPrefix}-${index+1}`,
      trackId:input.trackId,from:cursor,durationInFrames:step.durationInFrames,
      label:step.label??`${index+1}. ${step.motion}`,props,
    });
    cursor+=step.durationInFrames;
  });
  return result;
}
