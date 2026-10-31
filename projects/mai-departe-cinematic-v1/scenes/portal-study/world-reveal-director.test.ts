import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import cues from './film-cue-sheet.json';
import {worldRevealDirector} from './world-reveal-director';

test('all six worlds have a shared deterministic reveal and automatic full-world phase',()=>{
 for(const w of cues.worlds){
  const entry=worldRevealDirector(Math.round(w.entry[0]*30));
  const full=worldRevealDirector(Math.round((w.entry[1]+1)*30));
  assert.ok(entry.edgeEnergy>=0&&entry.edgeEnergy<=1);
  assert.equal(full.fullReveal,true,w.id);
  assert.ok(Math.abs(full.centerX)<.1);
  assert.ok(Math.abs(full.centerY)<.1);
  assert.ok(Number.isFinite(full.forward));
  assert.deepEqual(full,worldRevealDirector(Math.round((w.entry[1]+1)*30)));
 }
});
test('lighting and camera controls remain finite across whole movie and seeks',()=>{
 for(let f=0;f<7199;f+=17){
  const s=worldRevealDirector(f);
  for(const n of [s.exposure,s.shimmer,s.forward,s.driftX,s.driftY,s.centerX,s.centerY,s.edgeEnergy]){
   assert.ok(Number.isFinite(n),`invalid number at frame ${f}`);
  }
  assert.ok(s.exposure>=0&&s.exposure<.4);
 }
});
