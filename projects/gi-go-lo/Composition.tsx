import {Canvas,useCurrentFrame} from '@motion/sdk';
import {TimelineComposition,type EditableVideoProps,type EditableComponent} from '@motion/sdk/editor';
import {parseEditTimeline} from '@motion/sdk/timeline';
import {subtitleModule} from '@motion/lyrics-sync/component';
import data from './edit-timeline.json';
function Background(){const frame=useCurrentFrame();return <Canvas background="#21182a"><div style={{position:'absolute',width:800,height:800,borderRadius:'50%',border:'2px solid #614968',right:-100,top:-100,transform:`scale(${1+Math.sin(frame/24)*.1})`}}/><div style={{fontSize:24,letterSpacing:7,color:'#c5f18a'}}>GI GO LO / LYRICS LAB</div><div style={{marginTop:'auto',fontSize:23,color:'#cfb99b',padding:20,borderTop:'1px solid #514359'}}>ILLUSTRATIVE TIMING ONLY · No song audio supplied · Not aligned to a recording</div></Canvas>;}
export const editorComponents:EditableComponent[]=[{id:'background',name:'Music backdrop',fields:[],component:Background},subtitleModule];
export default function GiGoLo({timeline}:EditableVideoProps){return <TimelineComposition timeline={timeline??parseEditTimeline(data)} components={editorComponents}/>;}
