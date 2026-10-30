import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {revealMotion} from './reveal-motion';

test('world motion is deterministic across direct seeks',()=>{
 const frames=[0,150,270,330,390,450,540,690,810];
 const values=frames.map(frame=>revealMotion(frame/30));
 for(let i=frames.length-1;i>=0;i--)assert.deepEqual(revealMotion(frames[i]/30),values[i]);
});
test('near relief translates faster than distant and sky in film',()=>{
 for(const t of [1,8,11,15,23]){
  const m=revealMotion(t).flow;
  assert.ok(Math.abs(m.near)>Math.abs(m.middle));
  assert.ok(Math.abs(m.middle)>Math.abs(m.far));
  assert.ok(Math.abs(m.far)>Math.abs(m.sky));
 }
});
test('motion never restarts at shot transitions',()=>{
 for(const boundary of [8,13,15,23,27]){
  const prior=revealMotion(boundary-1/30).forward;
  const now=revealMotion(boundary).forward;
  const after=revealMotion(boundary+1/30).forward;
  assert.ok(now>prior&&after>now);
  assert.ok(Math.abs((now-prior)-(after-now))<.005);
 }
});
