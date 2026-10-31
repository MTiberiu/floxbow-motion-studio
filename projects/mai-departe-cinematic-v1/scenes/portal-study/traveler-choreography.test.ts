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
   assert.ok(nearClose.detached>.9, w.id+' traveler '+index+' still flying when closure begins');
   const atEnd=travelerPoseAt(w.end,index);
   assert.equal(atEnd.detached,0);
   assert.ok(Math.abs(atEnd.x-travelerXAt(w.end))<.001);
   assert.equal(atEnd.scale,1);
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

test('each 3D world closes over exactly the same duration as it opened',()=>{
 for(const w of journeyCut){
  assert.ok(Math.abs((w.end-w.close)-(w.full-w.enter))<.001,w.id);
 }
});
test('three actors return gradually on the same closing sequence',()=>{
 for(const w of journeyCut){
  const t=w.close+(w.end-w.close)*.45;
  const poses=[0,1,2].map(i=>travelerPoseAt(t,i));
  assert.ok(poses[2].detached<=poses[1].detached+1e-8);
  assert.ok(poses[1].detached<=poses[0].detached+1e-8);
  for(let i=0;i<3;i++){
   assert.ok(poses[i].detached>=0 && poses[i].detached<=1);
  }
 }
});
