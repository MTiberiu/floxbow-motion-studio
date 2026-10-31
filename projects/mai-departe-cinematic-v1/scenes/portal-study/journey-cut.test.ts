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

test('traveler markers stay ahead of revealed edge while on screen, and exit before full reveal',()=>{
 const smooth=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
 for(const world of journeyCut){
  for(let n=0;n<=100;n++){
   const progress=n/100;
   const t=world.enter+(world.full-world.enter)*progress;
   const state=journeyAt(Math.floor(t*30));
   if(state.phase!=='reveal')continue;
   const front=-100+2240*state.mask;
   // 42px margin accounts for the organic ripples across its full height.
   if(state.travelerX<=1920)assert.ok(front+42<state.travelerX,
    world.id+' at '+progress+' front='+front+' rider='+state.travelerX);
  }
  const halfway=journeyAt(Math.round((world.enter+(world.full-world.enter)*.6)*30));
  assert.ok(halfway.travelerX>1920,'riders must depart before final reveal');
  const closeStart=journeyAt(Math.ceil(world.close*30));
  assert.ok(closeStart.mask>.99,'old world stays open as riders first arrive');
 }
});
