import {useLayoutEffect,useMemo,useRef} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {EditableComponent} from '@motion/sdk/editor';
import type {TimelineClip} from '@motion/sdk/timeline';
import desert from '../../assets/camera-desert-v1.png';
import forest from '../../assets/camera-forest-v1.png';
import ice from '../../assets/camera-ice-v1.png';
import cloud from '../../assets/camera-cloud-v1.png';
import harbor from '../../assets/camera-harbor-v1.png';
import natural from '../../assets/camera-valley-v1.png';
import paper from '../../assets/camera-valley-paper-v1.png';
import {RestoredFilmHub,restoredFilmHubModule} from './RestoredFilmHub';
import {filmState} from './film-state';
import {RiftBoundary} from './RiftBoundary';
import {frontierX} from '../emulsion-field';
import {transportSeconds,filmIsExploring} from './film-transport';
import {worldRevealDirector} from './world-reveal-director';
import {worldCameraAt} from './world-camera-director';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`uniform sampler2D natural;uniform sampler2D paperImage;uniform float progress;uniform float time;uniform float warp;uniform vec2 lens;uniform vec2 worldDrift;uniform float forward;uniform float exposure;uniform float shimmer;uniform float edgeEnergy;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}
void main(){
 // Fixed image coordinates keep the transformation anchored to the landscape.
 float arrival=.18+vUv.y*.48+vUv.x*.15+n(vUv*9.)*.11+n(vUv*41.)*.035;
 float material=smoothstep(arrival-.065,arrival+.065,progress*1.15);
 vec2 delta=vUv-lens;
 float distanceToLens=length(delta);
 // Depth-graded optical motion on a single plate: near foreground travels more
 // than distant mountains. This is an interim effect until alpha layers exist.
 float nearDepth=1.-smoothstep(.12,.72,vUv.y);
 float motionScale=1.-min(.055,forward*(.2+nearDepth*.8));
 vec2 uv=(vUv-.5)*motionScale+.5;
 uv+=worldDrift*vec2(.4+nearDepth*.6,.35+nearDepth*.65);
 uv+=delta*exp(-distanceToLens*7.)*warp*.12;
 uv=clamp(uv,vec2(.001),vec2(.999));
 float lake=1.-smoothstep(.23,.31,uv.y);
 uv.x+=sin(uv.y*320.+time*.8)*.00035*lake*(1.-material);
 vec3 a=texture2D(natural,uv).rgb;
 vec3 b=texture2D(paperImage,uv).rgb;
 float seam=(1.-smoothstep(.0,.025,abs(arrival-progress*1.15)))*step(.001,progress)*(1.-step(.999,progress));
 vec3 color=mix(a,b,material)+vec3(.07,.033,.008)*seam;
 // Local, slow-moving sun/water illumination rather than whole-image flashing.
 float lightPool=exp(-pow((vUv.x-(.47+.035*sin(time*.23)))/.32,2.))*
  (.35+.65*smoothstep(.25,.86,vUv.y));
 float reflected=(1.-smoothstep(.19,.37,vUv.y))*
  pow(max(0.,sin(vUv.x*105.+time*.82+vUv.y*40.)),10.);
 color*=1.+exposure*(.38+.62*lightPool);
 color+=vec3(1.,.66,.34)*(reflected*.028*shimmer+edgeEnergy*.006);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
function BackgroundWorld({frame,worldImage,worldIndex}:{frame:number;worldImage:string;worldIndex:number}){
 const state=filmState(frame);const reveal=worldRevealDirector(frame);const cameraPlan=worldCameraAt(frame,worldIndex);const {camera,invalidate}=useThree();
 const textures=useLoader(THREE.TextureLoader,[worldImage,worldIndex===0?paper:worldImage]);
 const uniforms=useMemo(()=>({natural:{value:textures[0]},paperImage:{value:textures[1]},progress:{value:0},time:{value:0},warp:{value:0},lens:{value:new THREE.Vector2(.39,.56)},worldDrift:{value:new THREE.Vector2()},forward:{value:0},exposure:{value:0},shimmer:{value:0},edgeEnergy:{value:0}}),[textures]);
 const material=useRef<THREE.ShaderMaterial>(null);
 useLayoutEffect(()=>{textures.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;});},[textures]);
 useLayoutEffect(()=>{
  // Shared soft auto-framing: gradual look-at compensation, not a sudden zoom.
  camera.position.set(...cameraPlan.position);
  camera.lookAt(...cameraPlan.target);
  uniforms.progress.value=worldIndex===0?state.paper:0;uniforms.time.value=state.time;
  uniforms.warp.value=worldIndex===state.index?state.warp:0;uniforms.lens.value.set(.5,.55);
  uniforms.worldDrift.value.set(reveal.driftX,reveal.driftY);
  uniforms.forward.value=reveal.forward;
  uniforms.exposure.value=reveal.exposure;
  uniforms.shimmer.value=reveal.shimmer;
  uniforms.edgeEnergy.value=reveal.edgeEnergy;
  if(material.current)material.current.uniformsNeedUpdate=true;
  camera.updateProjectionMatrix();invalidate();
 },[camera,invalidate,frame,uniforms,state.paper,state.time,reveal.centerX,reveal.centerY,reveal.driftX,reveal.driftY,reveal.forward,reveal.exposure,reveal.shimmer,reveal.edgeEnergy,...cameraPlan.position,...cameraPlan.target]);
 return <mesh position={[0,0,0]}><planeGeometry args={[68,38.25]}/><shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} toneMapped={false}/></mesh>;
}
/** Same renderer for a revealed world and for its full-screen exploration.
 * Both cases use identical geometry, shader, lighting and camera at the same
 * absolute frame. During a return the next world is mounted alongside the
 * outgoing world only while both are visible.
 */
function WorldCanvas({frame,index,image,width,height}:{frame:number;index:number;image:string;width:number;height:number}){
 const plan=worldCameraAt(frame,index);
 return <ThreeCanvas width={width} height={height}
  style={{position:'absolute',inset:0,width:'100%',height:'100%'}}
  camera={{fov:50,position:plan.position,near:.1,far:200}}
  gl={{alpha:true,antialias:true}}>
  <BackgroundWorld key={index} frame={frame} worldImage={image} worldIndex={index}/>
 </ThreeCanvas>;
}
/** Complete music-driven world cycle; plates remain ready for user-authored depth layers. */
export function PortalMaterialScene({clip,frame=0}:{clip:TimelineClip;frame?:number}){
 const {width,height,fps}=useVideoConfig();const absolute=(clip.from+frame)*30/fps;const state=filmState(absolute);
 const showReturn=state.showReturn;
 const sprocketTime=transportSeconds(state.time);
 const filmParked=filmIsExploring(state.time);
 const reveal=worldRevealDirector(absolute);
 // Blend film treatment away during the LAST 40% of entry; same 3D world
 // remains underneath as the reveal takes over the whole screen.
 const revealFinish=Math.max(0,Math.min(1,(state.entry-.60)/.40));
 const worlds=[natural,harbor,desert,forest,ice,cloud];
 const currentImage=worlds[state.index];
 const nextIndex=Math.min(state.index+1,worlds.length-1);
 const nextImage=worlds[nextIndex];
 const lastWorld=state.index===worlds.length-1;
 // The complete destination road arrives from the left. Its travelers and
 // trailing reveal share one transform, so the image cannot overtake them.
 const roadOffset=-2200*(1-state.returning);
 const speed=1920/Number(clip.props.horizon??55);
 // Large directed inlet plus film-anchored emulsion detail. The shape persists
 // until it leaves the viewport; it never straightens into a wipe.
 const finish=Math.max(0,(state.returning-.8)/.2);
 const leadingEdge=roadOffset+1920+700*finish*finish;
 const exitAt=(y:number)=>leadingEdge-230-190*Math.cos((y-90)*.008)
   +.65*(frontierX(state.time,y,speed,0));
 const edgePoints=Array.from({length:145},(_,i)=>{const y=i*7.5;return [exitAt(y/1.2342857143),y];});
 // Cover the furthest visible boundary in destination-local coordinates,
 // including a safety margin for the luminous edge. Do not stretch the art.
 const roadExtension=Math.max(0,Math.max(...edgePoints.map(([x])=>x))-roadOffset-1920+80);
 const edgePath='M'+edgePoints.map(([x,y])=>`${x},${y/1.2342857143}`).join(' L');
 const oldWorldClip=`polygon(${edgePoints.map(([x,y])=>`${x/19.2}% ${y/10.8}%`).join(',')},100% 100%,100% 0%)`;
 return <AbsoluteFill style={{background:'#110e0c',overflow:'hidden'}} data-portal-study-time={state.time}
  data-paper-progress={state.paper} data-return-progress={state.returning}
  data-active-director="continuous-film-cycle" data-film-transport={filmParked?"parked":"running"}
  data-world-reveal={reveal.fullReveal?"full":"transition"} data-reveal-energy={reveal.edgeEnergy.toFixed(3)}>
  {showReturn&&!state.finale&&<AbsoluteFill style={{transform:`translateX(${roadOffset/19.2}%)`,overflow:'visible',background:'#100e11'}}>
   <AbsoluteFill style={{transform:'scaleY(1.2342857143)',transformOrigin:'top'}}>
    <RestoredFilmHub clip={clip} frame={absolute*fps/30} travelersOnly={lastWorld} rails={0} roadExtension={roadExtension}
     worldLayer={!lastWorld?<WorldCanvas frame={absolute} index={nextIndex} image={nextImage} width={width} height={height}/>:undefined}/>
   </AbsoluteFill>
  </AbsoluteFill>}
  {!state.finale&&state.returning<1&&<AbsoluteFill style={{clipPath:showReturn?oldWorldClip:undefined,overflow:'hidden'}}>
   <AbsoluteFill style={{transform:showReturn?`translateX(${state.returning*7}%)`:undefined}}>
    <WorldCanvas frame={absolute} index={state.index} image={currentImage} width={width} height={height}/>
   </AbsoluteFill>
  </AbsoluteFill>}
  {!state.finale&&state.entry<1&&<AbsoluteFill style={{transform:'scaleY(1.2342857143)',transformOrigin:'top'}}>
   <RestoredFilmHub clip={clip} frame={absolute*fps/30} openWorld crossing={state.warp} rails={0} revealFinish={revealFinish} revealAdvance={state.entry*1600}/>
  </AbsoluteFill>}
  {showReturn&&state.returning<1&&<svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
   style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <g transform="scale(1 1.2342857143)"><RiftBoundary time={state.time} speed={speed} revealX={0} edge={edgePath} sampleAt={exitAt} intensity={state.warp}/></g>
  </svg>}
  {state.finale&&<AbsoluteFill style={{transform:'scaleY(1.2342857143)',transformOrigin:'top'}}>
   <RestoredFilmHub clip={clip} frame={absolute*fps/30} travelersOnly rails={0}/>
  </AbsoluteFill>}
  {/* Screen-space rails remain above every world and every reveal. */}
  <svg data-fixed-film-frame viewBox="0 0 1920 875" preserveAspectRatio="none"
   style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <defs><linearGradient id="fixedFilmRail" x2="0" y2="1"><stop stopColor="#160e0a"/><stop offset=".5" stopColor="#412416"/><stop offset="1" stopColor="#120e0e"/></linearGradient></defs>
   <path d="M0 0H1920V80H0Z M0 805H1920V875H0Z" fill="url(#fixedFilmRail)"/>
   <path d="M0 80H1920 M0 805H1920" stroke="#bb7b44" strokeWidth="3"/>
   {Array.from({length:35},(_,i)=>{const x=i*60-(sprocketTime*1920/Number(clip.props.horizon??55)%60);return <g key={i} fill="#ba8751"><rect x={x} y="23" width="30" height="33" rx="5"/><rect x={x} y="827" width="30" height="28" rx="5"/></g>;})}
  </svg>
 </AbsoluteFill>;
}

export const portalStudyModule:EditableComponent={...restoredFilmHubModule,id:'director-journey-reveal',name:'Portal → landscape → paper (reference)',component:PortalMaterialScene};
export const portalStudyContinuation:EditableComponent={...portalStudyModule,id:'director-journey-reveal-legacy'};
