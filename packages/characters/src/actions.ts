import {z} from 'zod';
import {parseEditTimeline,type EditTimeline,type TimelineClip} from '@motion/sdk/timeline';

export const mascotPropsSchema=z.object({
  motion:z.enum(['idle','walk','jump','dance']).default('idle'),
  color:z.string().regex(/^#[0-9a-f]{6}$/i).default('#76d4ec'),
  accent:z.string().regex(/^#[0-9a-f]{6}$/i).default('#f8c86d'),
  x:z.number().min(5).max(95).default(50),
  y:z.number().min(10).max(90).default(58),
  scale:z.number().min(0.4).max(2).default(1),
  speed:z.number().min(0.25).max(4).default(1),
  speechClipId:z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100).default(''),
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
  const active=words.find(w=>w&&typeof w==='object'&&
    typeof w.start==='number'&&typeof w.end==='number'&&offset>=w.start&&offset<w.end);
  const word=active&&typeof active.text==='string'?active.text:'';
  return {speaking:true,text,word,wordTimed:!!active};
}
