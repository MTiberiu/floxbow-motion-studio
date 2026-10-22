import {createContext,useContext,type ReactNode} from 'react';
import {AbsoluteFill,useCurrentFrame,useVideoConfig} from 'remotion';
import {TimelineComposition,type EditableComponent} from '@motion/sdk/editor';
import {type EditTimeline,type EditableField,type TimelineClip} from '@motion/sdk/timeline';
import {mascotPropsSchema,speechAtFrame} from './actions';
import {getSubtitleCues,selectSubtitleCues} from '@motion/lyrics-sync/subtitles';
export {addMascot,removeMascot,composeMascotDance,choreographyStepSchema,mascotPropsSchema,speechAtFrame} from './actions';
export type {MascotProps,MascotMotion,ChoreographyStep} from './actions';

const TimelineContext=createContext<EditTimeline|null>(null);
export function MascotTimelineComposition({timeline,components}:{timeline:EditTimeline;components:EditableComponent[]}) {
  return <TimelineContext.Provider value={timeline}><TimelineComposition timeline={timeline} components={components}/></TimelineContext.Provider>;
}
export const mascotFields:EditableField[]=[
  {key:'motion',label:'Movement',target:'props',type:'select',default:'idle',options:['idle','walk','jump','dance','spin','wave']},
  {key:'color',label:'Body',target:'props',type:'color',default:'#76d4ec'},
  {key:'accent',label:'Accent',target:'props',type:'color',default:'#f8c86d'},
  {key:'startX',label:'Start X (%)',target:'props',type:'number',default:50,min:-40,max:140,step:1},
  {key:'endX',label:'End X (%)',target:'props',type:'number',default:50,min:-40,max:140,step:1},
  {key:'startY',label:'Start Y (%)',target:'props',type:'number',default:58,min:-40,max:140,step:1},
  {key:'endY',label:'End Y (%)',target:'props',type:'number',default:58,min:-40,max:140,step:1},
  {key:'easing',label:'Path easing',target:'props',type:'select',default:'linear',options:['linear','ease-in-out']},
  {key:'x',label:'X (%)',target:'props',type:'number',default:50,min:5,max:95,step:1},
  {key:'y',label:'Y (%)',target:'props',type:'number',default:58,min:10,max:90,step:1},
  {key:'scale',label:'Size',target:'props',type:'number',default:1,min:0.4,max:2,step:0.05},
  {key:'speed',label:'Movement speed',target:'props',type:'number',default:1,min:0.25,max:4,step:0.25},
  {key:'consumerId',label:'Subtitle consumer ID',target:'props',type:'text',default:''},
  {key:'speechClipId',label:'Linked subtitle clip ID',target:'props',type:'text',default:''},
  {key:'bubble',label:'Speech bubble',target:'props',type:'boolean',default:true},
];
/** SVG-only, deterministic posing; no WebGL, frame loops, asset downloads or three.js. */
export function Mascot({clip}:{clip:TimelineClip}) {
  const localFrame=useCurrentFrame();
  const {fps}=useVideoConfig();
  const timeline=useContext(TimelineContext);
  const props=mascotPropsSchema.parse(clip.props);
  const absoluteFrame=clip.from+localFrame;
  const consumerCues=timeline&&props.consumerId?selectSubtitleCues(getSubtitleCues(timeline),{kind:'consumer',consumerId:props.consumerId}):[];
  const activeCue=consumerCues.find(c=>c.presentation!=='hidden'&&(c.presentation==='bubble'||c.presentation==='both')&&absoluteFrame/timeline!.fps>=c.start&&absoluteFrame/timeline!.fps<c.end);
  const activeWord=activeCue?.wordTimingStatus==='matches-text'?activeCue.words?.find(w=>absoluteFrame/timeline!.fps>=w.start&&absoluteFrame/timeline!.fps<w.end):undefined;
  const speech=activeCue?{speaking:true,text:activeCue.text,word:activeWord?.text??'',wordTimed:!!activeWord}:timeline&&props.speechClipId&&!props.consumerId?speechAtFrame(timeline,props.speechClipId,absoluteFrame):{speaking:false,text:'',word:'',wordTimed:false};
  const t=localFrame/fps*props.speed;
  const progress=Math.max(0,Math.min(1,localFrame/Math.max(1,clip.durationInFrames-1)));
  const eased=props.easing==='ease-in-out'?progress*progress*(3-2*progress):progress;
  const positionX=(props.startX??props.x)+((props.endX??props.x)-(props.startX??props.x))*eased;
  const positionY=(props.startY??props.y)+((props.endY??props.y)-(props.startY??props.y))*eased;
  const phase=t*Math.PI*2;
  const step=Math.sin(phase*2);
  const dance=props.motion==='dance';
  const spin=props.motion==='spin';
  const wave=props.motion==='wave';
  const jump=props.motion==='jump';
  const walk=props.motion==='walk';
  const bounce=jump?Math.abs(Math.sin(phase*0.7))*105:dance?Math.abs(Math.sin(phase))*30:walk?Math.abs(step)*10:Math.sin(phase*0.35)*6;
  const tilt=dance?Math.sin(phase)*13:walk?Math.sin(phase)*5:Math.sin(phase*0.35)*2;
  const spinDegrees=spin?t*360:0;
  const leftArm=dance?-36+Math.sin(phase)*42:walk?Math.sin(phase)*26:jump?-42:0;
  const rightArm=wave?-110+Math.sin(phase*2)*22:dance?36+Math.sin(phase+Math.PI)*42:walk?-Math.sin(phase)*26:jump?42:0;
  const mouthOpen=speech.speaking&&(speech.wordTimed||(!speech.word&&Math.sin(localFrame*1.3)>-0.18));
  const shadowScale=1-Math.min(bounce/200,0.38);
  return <AbsoluteFill style={{pointerEvents:'none'}}>
    <div data-mascot-id={clip.id} data-motion={props.motion} data-speaking={!!speech.speaking}
      style={{position:'absolute',left:positionX+'%',top:positionY+'%',width:320,height:390,transform:'translate(-50%,-50%) scale('+props.scale+') rotateY('+spinDegrees+'deg)'}}>
      <svg viewBox="0 0 320 390" width="320" height="390" aria-label="Animated cartoon mascot" role="img">
        <ellipse cx="160" cy="352" rx={76*shadowScale} ry={15*shadowScale} fill="#091a33" opacity=".22"/>
        <g transform={`translate(0 ${-bounce}) rotate(${tilt} 160 210)`}>
          <g transform={`rotate(${leftArm} 95 214)`}><path d="M101 215 Q57 221 47 274" fill="none" stroke={props.color} strokeWidth="25" strokeLinecap="round"/><circle cx="46" cy="274" r="16" fill={props.accent}/></g>
          <g transform={`rotate(${rightArm} 225 214)`}><path d="M220 215 Q265 221 272 274" fill="none" stroke={props.color} strokeWidth="25" strokeLinecap="round"/><circle cx="273" cy="274" r="16" fill={props.accent}/></g>
          <g transform={`rotate(${walk?step*15:dance?step*23:0} 134 300)`}><path d="M137 298 L128 339" stroke={props.color} strokeWidth="27" strokeLinecap="round"/><ellipse cx="121" cy="340" rx="28" ry="13" fill={props.accent}/></g>
          <g transform={`rotate(${walk?-step*15:dance?-step*23:0} 187 300)`}><path d="M184 298 L195 339" stroke={props.color} strokeWidth="27" strokeLinecap="round"/><ellipse cx="202" cy="340" rx="28" ry="13" fill={props.accent}/></g>
          <defs><linearGradient id={'mascot-shine-'+clip.id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".42"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient></defs>
          <rect x="79" y="70" width="162" height="238" rx="78" fill={props.color} stroke="#183653" strokeWidth="5"/>
          <rect x="87" y="77" width="142" height="207" rx="69" fill={`url(#mascot-shine-${clip.id})`}/>
          <ellipse cx="128" cy="163" rx="12" ry="18" fill="#19334e"/>
          <ellipse cx="193" cy="163" rx="12" ry="18" fill="#19334e"/>
          <circle cx="132" cy="157" r="4" fill="white"/><circle cx="197" cy="157" r="4" fill="white"/>
          {mouthOpen?<><ellipse cx="160" cy="215" rx="19" ry={speech.wordTimed?21:13} fill="#19334e"/><ellipse cx="160" cy="228" rx="10" ry="5" fill="#f18ca7"/></>:<path d="M144 211 Q160 226 178 211" fill="none" stroke="#19334e" strokeWidth="6" strokeLinecap="round"/>}
          <ellipse cx="111" cy="205" rx="12" ry="6" fill="#fb98ae" opacity=".65"/>
          <ellipse cx="209" cy="205" rx="12" ry="6" fill="#fb98ae" opacity=".65"/>
        </g>
      </svg>
      {props.bubble&&speech.speaking&&speech.text&&<div style={{position:'absolute',left:230,top:-12,minWidth:190,maxWidth:390,padding:'17px 22px',background:'white',border:'4px solid #19334e',borderRadius:23,color:'#19334e',fontFamily:'Arial,sans-serif',fontSize:24,fontWeight:800,boxShadow:'6px 7px 0 #19334e33',overflowWrap:'break-word'}}>
        {speech.text}
        <span style={{position:'absolute',left:-15,top:72,width:24,height:24,background:'white',borderLeft:'4px solid #19334e',borderBottom:'4px solid #19334e',transform:'rotate(45deg)'}}/>
      </div>}
    </div>
  </AbsoluteFill>;
}
export const mascotModule:EditableComponent={id:'mascot-2p5d',name:'Mascot 2.5D',fields:mascotFields,component:Mascot};
