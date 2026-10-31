import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {journeyAt,journeyCut} from './journey-cut';

test('four non-overlapping worlds, others are HUB-only and at most one 3D scene at a time',()=>{
 assert.equal(journeyCut.length,4);
 for(let i=1;i<journeyCut.length;i++)assert.ok(journeyCut[i-1].end<journeyCut[i].enter);
 for(let f=0;f<7199;f++){
  const phase=journeyAt(f);
  const matches=journeyCut.filter(w=>f/30>=w.enter&&f/30<w.end);
  assert.ok(matches.length<=1);
  assert.equal(phase.worldMount,matches.length===1);
  assert.deepEqual(phase,journeyAt(f));
 }
});
test('intro and finale have no 3D world, travelers complete solo passage before each reveal',()=>{
 assert.equal(journeyAt(0).phase,'hub');
 assert.equal(journeyAt(0).worldMount,false);
 assert.equal(journeyAt(220*30).worldMount,false);
 for(const world of journeyCut){
  const before=journeyAt(Math.round(world.enter*30)-1);
  const entry=journeyAt(Math.ceil(world.enter*30));
  assert.equal(before.phase,'hub');
  assert.ok(Math.abs(before.travelerX-1152)<4);
  assert.equal(entry.phase,'reveal');
  assert.ok(entry.travelerX>=1152);
 }
});
test('worlds reveal, explore, then close to return to HUB; masks have no sudden phases',()=>{
 for(const world of journeyCut){
  assert.equal(journeyAt(Math.ceil(world.full*30)).phase,'explore');
  assert.equal(journeyAt(Math.ceil(world.close*30)).phase,'close');
  assert.equal(journeyAt(Math.ceil(world.end*30)).phase,'hub');
  assert.ok(journeyAt(Math.floor(world.full*30)-1).mask<1);
  assert.equal(journeyAt(Math.ceil(world.full*30)).mask,1);
  assert.equal(journeyAt(Math.ceil(world.close*30)).mask,1);
  assert.ok(journeyAt(Math.floor(world.end*30)-1).mask>0);
 }
});

test('traveler X stays continuous and maintains the same speed across HUB to REVEAL',()=>{
 for(let i=0;i<journeyCut.length;i++){
  const w=journeyCut[i];
  const at=Math.ceil(w.enter*30);
  const x0=journeyAt(at-2).travelerX;
  const x1=journeyAt(at-1).travelerX;
  const x2=journeyAt(at).travelerX;
  const x3=journeyAt(at+1).travelerX;
  assert.ok(Math.abs(x2-x1)<7,w.id+' has no start teleport');
  assert.ok(Math.abs((x3-x2)-(x1-x0))<1,w.id+' has no reveal speed boost');
  const justBeforeFull=journeyAt(Math.floor(w.full*30)-1).travelerX;
  const afterFull=journeyAt(Math.ceil(w.full*30)+1).travelerX;
  assert.ok(Math.abs(afterFull-justBeforeFull)<12,w.id+' has no explore teleport');
 }
});

test('each HUB journey begins exactly at left edge and reaches 60 percent before reveal',()=>{
 for(let i=0;i<journeyCut.length;i++){
  const world=journeyCut[i];
  const hubStart=i===0?0:journeyCut[i-1].end;
  const start=journeyAt(Math.ceil(hubStart*30));
  assert.equal(start.phase,'hub');
  assert.ok(start.travelerX>=0 && start.travelerX<4,'HUB must start at the actual left edge for '+world.id);
  const before=journeyAt(Math.floor(world.enter*30)-1);
  assert.ok(before.travelerX>1140 && before.travelerX<1152,'HUB should approach 60% at reveal '+world.id);
 }
});
