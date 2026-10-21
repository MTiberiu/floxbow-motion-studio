import type {ComponentType} from 'react';
import {AbsoluteFill,Sequence} from 'remotion';
import {componentInfoSchema,parseEditTimeline,type EditTimeline,type TimelineClip,type ComponentInfo} from './timeline';
export type EditableComponent=ComponentInfo&{component:ComponentType<{clip:TimelineClip}>};
export type EditableVideoProps={timeline?:EditTimeline};
/** Strip executable renderer code before metadata crosses the isolated preview bridge. */
export function serializableComponentInfo(component:EditableComponent):ComponentInfo{
 const {component:_renderer,...info}=component;
 return componentInfoSchema.parse(info);
}
export function TimelineComposition({timeline,components}:{timeline:EditTimeline;components:EditableComponent[]}){
 const t=parseEditTimeline(timeline);
 return <AbsoluteFill style={{background:'#101725'}}>{t.tracks.flatMap(track=>t.clips.filter(c=>c.trackId===track.id).map(clip=>{
 const definition=components.find(c=>c.id===clip.componentId);if(!definition)throw new Error(`Unknown component ${clip.componentId}`);const Element=definition.component;
 return <Sequence key={clip.id} from={clip.from} durationInFrames={clip.durationInFrames} name={clip.label}><Element clip={clip}/></Sequence>;
 }))}</AbsoluteFill>;
}
