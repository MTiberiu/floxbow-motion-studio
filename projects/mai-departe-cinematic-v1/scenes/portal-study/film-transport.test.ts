import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import cues from './film-cue-sheet.json';
import {transportSeconds,filmIsExploring} from './film-transport';

test('sprockets park in each world and resume at its first return frame',()=>{
 for(const w of cues.worlds){
  const start=w.entry[1],end=w.exit[0];
  assert.equal(filmIsExploring((start+end)/2),true);
  assert.equal(filmIsExploring(end),false);
  assert.ok(Math.abs(transportSeconds(start)-transportSeconds((start+end)/2))<1e-8);
  assert.ok(Math.abs(transportSeconds(end)-transportSeconds(start))<1e-8);
  assert.ok(transportSeconds(end+.2)>transportSeconds(end));
 }
});
test('film time is monotonic and stable across random seeks/clip boundary',()=>{
 let last=-1;
 for(let i=0;i<2400;i++){
  const t=i/10;
  const value=transportSeconds(t);
  assert.ok(value+1e-8>=last);
  assert.equal(value,transportSeconds(t));
  last=value;
 }
 assert.ok(transportSeconds(30)>0);
});
