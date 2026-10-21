import {TimelineComposition,type EditableVideoProps} from '@motion/sdk/editor';
import {parseEditTimeline} from '@motion/sdk/timeline';
import {mascotModule,MascotTimelineComposition} from '@motion/characters';
import {subtitleModule} from '@motion/lyrics-sync/component';
import timelineData from './edit-timeline.json';
export const editorComponents=[mascotModule,subtitleModule];
export default function Composition({timeline}:EditableVideoProps){
  const doc=timeline??parseEditTimeline(timelineData);
  return <MascotTimelineComposition timeline={doc} components={editorComponents}/>;
}
