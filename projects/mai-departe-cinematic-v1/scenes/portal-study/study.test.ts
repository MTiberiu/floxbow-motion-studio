import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import protectedSources from './protected-sources.json';
import {studyState} from './study-state';
import {frontierX} from '../emulsion-field';
test('soundtrack metadata, timeline, lyrics and analysis sources are byte-identical',()=>{
 for(const source of protectedSources){const data=fs.readFileSync(new URL('../../'+source.file,import.meta.url));assert.equal(crypto.createHash('sha256').update(data).digest('hex').toUpperCase(),source.sha256);}
});
test('forward camera and material are continuous across the 30 second clip seam',()=>{
 let previous=studyState(0);
 for(let f=1;f<1656;f++){
  const s=studyState(f);assert.ok(s.position[2]<=previous.position[2]);
  assert.ok(previous.position[2]-s.position[2]<.1);assert.ok(s.paper>=previous.paper);
  previous=s;
 }
 assert.equal(studyState(496).paper,0);assert.equal(studyState(916).paper,1);
});
test('seeking backwards does not retain the paper material or camera position',()=>{
 const before=studyState(210);studyState(1050);assert.deepEqual(studyState(210),before);
 assert.equal(studyState(210).paper,0);assert.equal(studyState(1050).paper,1);
});
test('entry travels through the existing frontier, with every corner inside its opening before removal',()=>{
 const s=studyState(324);
 for(const [x,y] of [[0,0],[1920,0],[1920,1080],[0,1080]]){
  const localX=(x-s.entryX)/s.entryScale;
  const localY=(y-s.entryY)/s.entryScale/1.2342857143;
  assert.ok(localY>82&&localY<800);
  assert.ok(localX>0&&localX<frontierX(s.time,localY,1920/55,1000-6.5*1920/55));
 }
});
test('forward return reaches the paper hub and seeking to entry clears it',()=>{
 assert.equal(studyState(48*30).returning,0);
 assert.equal(studyState(56*30).returning,1);
 assert.equal(studyState(56*30).returnX,0);
 assert.ok(studyState(53*30).returnX>studyState(54*30).returnX);
 assert.equal(studyState(6*30).returning,0);
 assert.ok(studyState(54*30).position[2]<studyState(52*30).position[2]);
});
