import {useMemo} from 'react';

/**
 * Project-local Film Life v1.1.
 * Transparent atmospheric overlay, deterministic from song time.
 * Does not change the underlying artwork, playback, timeline or audio.
 */
const rnd=(x:number)=>{const v=Math.sin(x*127.1+43.7)*43758.5453;return v-Math.floor(v);};
const particles=Array.from({length:120},(_,i)=>({x:rnd(i*11)*1920,y:85+rnd(i*13+2)*710,s:rnd(i*17+3),phase:rnd(i*19+4)*Math.PI*2}));
const scratches=Array.from({length:18},(_,i)=>({x:rnd(i*37)*1920,length:90+rnd(i*7)*500,phase:rnd(i*5)*Math.PI*2}));

export function FilmLifeOverlay({time,amount=1}:{time:number;amount?:number}){
 const wave=Math.sin(time*.24)*.5+.5;
 const fogY=490+Math.sin(time*.14)*28;
 return <svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
   aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',mixBlendMode:'screen'}}>
   <defs>
    <radialGradient id="film-life-fog"><stop stopColor="#c6e5db" stopOpacity=".19"/><stop offset=".6" stopColor="#b8d4d4" stopOpacity=".07"/><stop offset="1" stopColor="#b8d4d4" stopOpacity="0"/></radialGradient>
    <radialGradient id="film-life-amber"><stop stopColor="#ffb961" stopOpacity=".19"/><stop offset="1" stopColor="#ffb961" stopOpacity="0"/></radialGradient>
   </defs>
   <g opacity={amount}>
    <ellipse cx={460+Math.sin(time*.08)*66} cy={fogY} rx="640" ry="145" fill="url(#film-life-fog)"/>
    <ellipse cx={350+Math.cos(time*.11)*48} cy={620+Math.sin(time*.17)*26} rx="480" ry="78" fill="url(#film-life-fog)"/>
    <ellipse cx={725+Math.sin(time*.13)*55} cy={400} rx="330" ry="210" fill="url(#film-life-amber)" opacity={.65+.35*wave}/>
    {particles.map((p,i)=>{
      const x=((p.x-time*(2+p.s*9))%1980+1980)%1980-20;
      const y=p.y+Math.sin(time*(.28+p.s*.3)+p.phase)*5;
      const blink=Math.pow(Math.max(0,Math.sin(time*(.4+p.s*.6)+p.phase)),4);
      return <circle key={i} cx={x} cy={y} r={.4+p.s*1.6}
        fill={p.s>.55?'#fff0c8':'#93dce1'} opacity={blink*.55}/>;
    })}
    {scratches.map((s,i)=>{
      const x=((s.x-time*3)%2000+2000)%2000;
      return <path key={i} d={`M${x} ${100+rnd(i*7)*350} q${Math.sin(i)*6} ${s.length*.48} ${Math.cos(i)*3} ${s.length}`}
       fill="none" stroke="#d5ac76" strokeWidth={.5+rnd(i*13)*.7}
       opacity={.04+.025*Math.sin(time*.18+s.phase)}/>;
    })}
   </g>
 </svg>;
}
