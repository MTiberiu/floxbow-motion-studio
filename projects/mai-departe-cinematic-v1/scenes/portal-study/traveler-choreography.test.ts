import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {journeyCut,travelerXAt} from './journey-cut';
import {travelerPoseAt} from './traveler-choreography';

test('travelers enter and leave individual flights on a stable musical path',()=>{
 for(const w of journeyCut){
  for(let index=0;index<3;index++){
   const early=travelerPoseAt(w.enter-5.1,index);
   assert.equal(early.detached,0);
   const nearClose=travelerPoseAt(w.close-.01,index);
   assert.ok(nearClose.detached<.0001, w.id+' traveler '+index+' must be home before closure');
   assert.ok(Math.abs(nearClose.x-travelerXAt(w.close-.01))<.001);
   assert.equal(nearClose.scale,1);
  }
 });
});
test('three musical actors detach sequentially and never alter the world layer',()=>{
 const w=journeyCut[0];
 const times=[w.enter-3.25,w.enter-2.45,w.enter-1.65];
 for(const time of times){
  for(let index=0;index<3;index++){
   const pose=travelerPoseAt(time,index);
   assert.ok(Number.isFinite(pose.x));
   assert.ok(Number.isFinite(pose.yOffset));
   assert.ok(pose.scale>=1);
  }
 }
 const at=w.enter-.5;
 assert.ok(travelerPoseAt(at,0).detached>=travelerPoseAt(at,1).detached);
 assert.ok(travelerPoseAt(at,1).detached>=travelerPoseAt(at,2).detached);
});
