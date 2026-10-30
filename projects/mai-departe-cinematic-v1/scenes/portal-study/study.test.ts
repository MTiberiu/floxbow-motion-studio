import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import protectedSources from './protected-sources.json';
import {studyState,portalOutline} from './study-state';
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
test('portal encloses all frame corners before removal, without exposing film edges',()=>{
 const polygon=portalOutline(.999,10.8);
 for(const [x,y] of [[0,0],[1920,0],[1920,1080],[0,1080]]){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   const a=polygon[i],b=polygon[j];
   if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  assert.ok(inside);
 }
});
