import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {riftPush} from './RiftPushTransition';

test('push entry covers the complete film and returns to full world',()=>{
 assert.equal(riftPush(239).phase,'film');
 assert.equal(riftPush(240).phase,'enter');
 assert.equal(riftPush(240).progress,0);
 assert.ok(riftPush(340).edgeX>0);
 assert.ok(riftPush(340).edgeX<1920);
 assert.equal(riftPush(450).phase,'world');
 assert.equal(riftPush(450).worldClip,'inset(0)');
});
test('return brings the same three-traveler film from left and fills frame',()=>{
 assert.equal(riftPush(690).phase,'return');
 assert.equal(riftPush(690).progress,0);
 assert.ok(riftPush(750).edgeX>0);
 assert.ok(riftPush(750).edgeX<1920);
 assert.equal(riftPush(810).phase,'film');
 assert.equal(riftPush(810).filmClip,'inset(0)');
});
test('transition is deterministic on seeks and keeps same seam for both materials',()=>{
 for(const f of [0,239,240,278,389,449,450,689,690,729,809,810]){
  assert.deepEqual(riftPush(f),riftPush(f));
  const r=riftPush(f);
  assert.ok(r.edgePath.startsWith('M'));
  assert.equal(r.edgePath.includes('NaN'),false);
 }
});
