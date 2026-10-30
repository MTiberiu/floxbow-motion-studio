import { Img } from 'remotion';
import type { EditableComponent } from '@motion/sdk/editor';
import type { TimelineClip } from '@motion/sdk/timeline';
import hesitate from '../assets/actors/phone-hesitate-v2.png';
import answer from '../assets/actors/phone-answer-v2.png';
import release from '../assets/actors/phone-release-v2.png';
const poses:Record<string,string>={hesitate,answer,release};
function PhonePerformance({clip,frame=0}:{clip:TimelineClip;frame?:number}) {
 const phase=String(clip.props.phase??'hesitate');
 const pose=phase==='release' && frame<clip.durationInFrames*0.35?'answer':phase;
 return <Img src={poses[pose]??hesitate} style={{position:'absolute',left:'18%',top:'2%',width:'64%',height:'72%',objectFit:'contain',objectPosition:'center',background:'#fff'}} />;
}
export const phonePerformanceModule:EditableComponent={id:'director-phone-performance',name:'Director · Phone acting poses',fields:[{key:'phase',target:'props',label:'Performance',type:'select',default:'hesitate',options:['hesitate','answer','release']}],component:PhonePerformance};
