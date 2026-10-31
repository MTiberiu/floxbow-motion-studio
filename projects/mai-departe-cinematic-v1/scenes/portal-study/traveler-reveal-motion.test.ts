import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import cues from './film-cue-sheet.json';
import {travelerRevealMotion} from './traveler-reveal-motion';

test('all worlds start with a visible photo reveal motion and settle without jump',()=>{
 for(const world of cues.worlds){
  const first=travelerRevealMotion(Math.round(world.entry[0]*30));
  const middle=travelerRevealMotion(Math.round((world.entry[0]+world.entry[1])/2*30));
  const settled=travelerRevealMotion(Math.round((world.entry[1]+.1)*30));
  assert.ok(first.scale>middle.scale,world.id);
  assert.ok(middle.scale>=settled.scale,world.id);
  assert.ok(Math.abs(settled.scale-1)<1e-6,world.id);
  assert.ok(Math.abs(settled.x)<1e-6,world.id);
  assert.deepEqual(first,travelerRevealMotion(Math.round(world.entry[0]*30)));
 }
});
test('destination image is alive during each return without resetting song time',()=>{
 for(const world of cues.worlds){
  const half=travelerRevealMotion(Math.round((world.exit[0]+world.exit[1])/2*30),'return');
  assert.ok(half.scale>1);
  assert.ok(half.scale<1.09);
 }
});
