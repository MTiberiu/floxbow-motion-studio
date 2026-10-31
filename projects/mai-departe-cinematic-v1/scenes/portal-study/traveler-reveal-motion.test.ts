import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import cues from './film-cue-sheet.json';
import {travelerRevealMotion} from './traveler-reveal-motion';

test('photo traverse happens with constant scale in each of six worlds',()=>{
 for(const world of cues.worlds){
  for(const mode of ['entry','return'] as const){
   const [start,end]=mode==='return'?world.exit:world.entry;
   const first=travelerRevealMotion(Math.round(start*30),mode);
   const middle=travelerRevealMotion(Math.round((start+end)/2*30),mode);
   const last=travelerRevealMotion(Math.round(end*30)-1,mode);
   assert.equal(first.scale,middle.scale,world.id);
   assert.equal(middle.scale,last.scale,world.id);
   assert.ok(first.x<middle.x&&middle.x<=last.x,world.id);
   assert.deepEqual(first,travelerRevealMotion(Math.round(start*30),mode));
  }
 }
});
