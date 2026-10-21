import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {addMascot,removeMascot,speechAtFrame,composeMascotDance} from '@motion/characters/actions';
import {parseEditTimeline} from '@motion/sdk/timeline';

const base=()=>parseEditTimeline({
  version:1,fps:30,durationInFrames:300,
  tracks:[{id:'characters',name:'Characters'},{id:'captions',name:'Captions'}],
  clips:[{id:'hello',trackId:'captions',componentId:'subtitles',label:'Hello',
    from:60,durationInFrames:60,content:{text:'Hello world',status:'demo',
    words:[{id:'word1',text:'Hello',start:0,end:0.5}]},props:{}}]
});
test('mascot agent operations preserve input and timeline v1',()=>{
  const input=base();const result=addMascot(input,{id:'bloop',trackId:'characters',from:0,durationInFrames:180,props:{motion:'dance',speechClipId:'hello'}});
  assert.equal(input.clips.length,1);assert.equal(result.clips.length,2);
  assert.equal(result.clips[1].componentId,'mascot-2p5d');
  assert.equal(result.clips[1].props.motion,'dance');
  assert.equal(removeMascot(result,'bloop').clips.length,1);
  assert.throws(()=>addMascot(input,{id:'oops',trackId:'missing',from:0,durationInFrames:5}));
  assert.throws(()=>addMascot(input,{id:'oops',trackId:'characters',from:299,durationInFrames:4}));
});
test('speech follows subtitle source frames and word offsets',()=>{
  const t=base();
  assert.equal(speechAtFrame(t,'hello',59).speaking,false);
  assert.equal(speechAtFrame(t,'hello',60).word,'Hello');
  assert.equal(speechAtFrame(t,'hello',92).speaking,true);
  assert.equal(speechAtFrame(t,'hello',120).speaking,false);
  assert.equal(speechAtFrame(t,'missing',80).speaking,false);
  const moved=structuredClone(t);moved.clips[0].from=90;
  assert.equal(speechAtFrame(moved,'hello',60).speaking,false);
  assert.equal(speechAtFrame(moved,'hello',90).word,'Hello');
});

test('AI choreography writes sequential editable clips deterministically',()=>{
  const input=base();
  const out=composeMascotDance(input,{idPrefix:'bloop',trackId:'characters',startFrame:0,props:{speechClipId:'hello'},steps:[
    {motion:'walk',durationInFrames:30,x:40},{motion:'jump',durationInFrames:20},
    {motion:'spin',durationInFrames:40},{motion:'dance',durationInFrames:60},
    {motion:'wave',durationInFrames:20}
  ]});
  assert.deepEqual(out.clips.slice(1).map(c=>[c.id,c.from,c.props.motion]),[
    ['bloop-1',0,'walk'],['bloop-2',30,'jump'],['bloop-3',50,'spin'],
    ['bloop-4',90,'dance'],['bloop-5',150,'wave']]);
  assert.equal(out.clips[1].props.x,40);
  assert.equal(input.clips.length,1);
  assert.throws(()=>composeMascotDance(input,{idPrefix:'bloop',trackId:'characters',startFrame:290,steps:[{motion:'dance',durationInFrames:20}]}));
});

test('choreography carries destination into next action and allows offscreen entry/exit',()=>{
 const input=base();
 const result=composeMascotDance(input,{idPrefix:'route',trackId:'characters',startFrame:0,props:{x:-20,y:60},steps:[
  {motion:'walk',durationInFrames:60,endX:40},
  {motion:'jump',durationInFrames:30},
  {motion:'walk',durationInFrames:60,endX:105},
  {motion:'dance',durationInFrames:30},
  {motion:'walk',durationInFrames:60,endX:130},
 ]});
 const steps=result.clips.slice(1);
 assert.deepEqual(steps.map(c=>[c.props.startX,c.props.endX]),[
  [-20,40],[40,40],[40,105],[105,105],[105,130]
 ]);
 assert.deepEqual(steps.map(c=>c.from),[0,60,90,150,180]);
});
