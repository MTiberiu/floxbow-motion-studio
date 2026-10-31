import type {TimelineClip} from '@motion/sdk/timeline';
import {directorLyricsModule} from '../DirectorComponents';
import {filmState} from './film-state';
function StudyLyrics({clip,frame=0}:{clip:TimelineClip;frame?:number}){
 const Component=directorLyricsModule.component;
 const dark=filmState(clip.from+frame).paper<.6;
 return <div style={{position:'absolute',inset:0,filter:dark?'invert(1)':undefined}}><Component clip={clip} frame={frame}/></div>;
}
export const portalStudyLyrics={...directorLyricsModule,component:StudyLyrics};
