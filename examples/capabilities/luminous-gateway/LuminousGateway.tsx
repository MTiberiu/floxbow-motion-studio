import {useMemo} from 'react';
import * as THREE from 'three';

/**
 * FloxBow — Luminous Gateway / 30-second proof.
 * Scene-local THREE primitives. All motion is an analytic function of time.
 * No audio or Timeline mutation; frame seek is deterministic.
 */
export function LuminousGateway({time}:{time:number}) {
  const points=useMemo(()=>{
    const arrays:THREE.Vector3[][]=[];
    for(let layer=0;layer<23;layer++){
      const a:THREE.Vector3[]=[];
      for(let j=0;j<=130;j++){
        const u=j/130, angle=u*Math.PI*2;
        const radius=138+layer*2.35+Math.sin(angle*6+layer*.55)*7;
        a.push(new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius*.83,0));
      }
      arrays.push(a);
    }
    return arrays.map(a=>new THREE.BufferGeometry().setFromPoints(a));
  },[]);
  const rays=useMemo(()=>{
    const output:THREE.Vector3[]=[];
    for(let i=0;i<105;i++){
      const theta=i*2.399963, radius=30+Math.sqrt((i+.5)/105)*147;
      output.push(new THREE.Vector3(Math.cos(theta)*radius,Math.sin(theta)*radius*.83,0));
    }
    return new THREE.BufferGeometry().setFromPoints(output);
  },[]);
  const start=Math.max(0,Math.min(1,(time-1.4)/4));
  const end=1-Math.max(0,Math.min(1,(time-26)/4));
  const amount=start*end;
  const x=-355+Math.sin(time*.12)*30;
  return <group position={[x,40,34]} rotation={[0,0,Math.sin(time*.13)*.035]}>
    <mesh renderOrder={70} scale={[1.65,1.65,1]}>
      <planeGeometry args={[600,600]}/>
      <shaderMaterial transparent depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending}
        uniforms={{time:{value:time},strength:{value:amount}}}
        vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
        fragmentShader={`uniform float time;uniform float strength;varying vec2 vUv;
        void main(){vec2 p=(vUv-.5)*2.;float r=length(p);
          float core=exp(-r*r*65.)*.65;
          float aura=exp(-pow((r-.38)*8.,2.))*.2;
          float filaments=pow(max(0.,sin(atan(p.y,p.x)*28.-time*.7+sin(r*30.)*3.)),24.)*exp(-pow((r-.37)*5.,2.))*.24;
          vec3 c=mix(vec3(.05,.38,.52),vec3(.60,.97,.88),clamp(1.-r,0.,1.));
          gl_FragColor=vec4(c,(core+aura+filaments)*strength*.8);}`}
      />
    </mesh>
    {points.map((geometry,i)=><line key={i} geometry={geometry} renderOrder={72+i}
      rotation={[0,0,time*(i%2?-.012:.014)+i*.12]}
      scale={[.85+i*.013,.85+i*.013,1]}>
      <lineBasicMaterial color={i%4===0?'#e2ffdf':i%3===0?'#61e6ff':'#38b7bd'}
        transparent opacity={amount*(i%4===0?.37:.12)} blending={THREE.AdditiveBlending}
        depthTest={false} depthWrite={false}/>
    </line>)}
    <points geometry={rays} rotation={[0,0,time*.045]} renderOrder={105}>
      <pointsMaterial color="#d9fff4" transparent opacity={amount*.88} size={3.6}
        sizeAttenuation={false} blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false}/>
    </points>
    {[0,1,2].map((i)=><mesh key={i} renderOrder={120+i}
      position={[Math.cos(time*.26+i*Math.PI*2/3)*110,Math.sin(time*.26+i*Math.PI*2/3)*91,8]}
      scale={[1,1,1]}>
      <sphereGeometry args={[3.4+i*.9,12,12]}/>
      <meshBasicMaterial color={['#c8fff5','#83d9ff','#f3dda4'][i]}
        transparent opacity={amount*.88} blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false}/>
    </mesh>)}
  </group>;
}
