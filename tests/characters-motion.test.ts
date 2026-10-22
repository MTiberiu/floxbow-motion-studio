import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {sampleMascotPose} from '@motion/characters/src/motion';

test('clip-edge pose is neutral for walking, jumping, waving and dance',()=>{
 for(const motion of ['walk','jump','dance','wave'] as const){
  const first=sampleMascotPose({motion,localFrame:0,durationInFrames:60,fps:30,speed:1});
  const last=sampleMascotPose({motion,localFrame:59,durationInFrames:60,fps:30,speed:1});
  for(const key of ['bounce','tilt','leftArm','rightArm','leftLeg','rightLeg'] as const){
   assert.ok(Math.abs(first[key])<1e-8,`${motion} start ${key}`);
   assert.ok(Math.abs(last[key])<1e-8,`${motion} end ${key}`);
  }
 }
});
test('walking varies during action and pose sampling is deterministic',()=>{
 const args={motion:'walk' as const,localFrame:13,durationInFrames:60,fps:30,speed:1,travelX:40};
 const a=sampleMascotPose(args);
 assert.deepEqual(a,sampleMascotPose(args));
 assert.ok(Math.abs(a.leftLeg)>0);
});
