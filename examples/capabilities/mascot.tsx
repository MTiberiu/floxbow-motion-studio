import {mascotModule,MascotTimelineComposition} from '@motion/characters';
import {parseEditTimeline} from '@motion/sdk/timeline';
const timeline=parseEditTimeline({version:1,fps:30,durationInFrames:120,tracks:[{id:'characters',name:'Characters'}],clips:[{id:'demo-mascot',trackId:'characters',componentId:'mascot-2p5d',label:'Dancing mascot',from:0,durationInFrames:120,content:{},props:{motion:'dance',speed:1.2,color:'#76d4ec'}}]});
export function MascotExample(){
  return <MascotTimelineComposition timeline={timeline} components={[mascotModule]}/>;
}
