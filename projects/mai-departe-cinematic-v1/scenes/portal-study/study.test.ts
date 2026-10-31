import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import protectedSources from './protected-sources.json';
import {studyState} from './study-state';
import {frontierX} from '../emulsion-field';
test('soundtrack metadata, timeline, lyrics and analysis sources are byte-identical',()=>{
 for(const source of protectedSources){const data=fs.readFileSync(new URL('../../'+source.file,import.meta.url));assert.equal(crypto.createHash('sha256').update(data).digest('hex').toUpperCase(),source.sha256);}
});
test('forward camera and material are continuous across the 30 second clip seam',()=>{
 let previous=studyState(0);
 for(let f=1;f<1656;f++){
  const s=studyState(f);assert.ok(s.position[2]<=previous.position[2]);
  assert.ok(previous.position[2]-s.position[2]<.1);assert.ok(s.paper>=previous.paper);
  previous=s;
 }
 assert.equal(studyState(496).paper,0);assert.equal(studyState(916).paper,1);
});
test('seeking backwards does not retain the paper material or camera position',()=>{
 const before=studyState(210);studyState(1050);assert.deepEqual(studyState(210),before);
 assert.equal(studyState(210).paper,0);assert.equal(studyState(1050).paper,1);
});
test('film stays fixed while the existing frontier clears the complete aperture',()=>{
 for(let frame=0;frame<=324;frame++){
  const s=studyState(frame);assert.equal(s.entryScale,1);assert.equal(s.entryX,0);assert.equal(s.entryY,0);
 }
 const s=studyState(324);
 for(let y=82;y<=800;y+=2)assert.ok(frontierX(s.time,y,1920/55,1000-6.5*1920/55+s.entry*1600)>1920);
});
test('forward return reaches the paper hub and seeking to entry clears it',()=>{
 assert.equal(studyState(48*30).returning,0);
 assert.equal(studyState(56*30).returning,1);
 assert.equal(studyState(56*30).returnX,0);
 assert.ok(studyState(53*30).returnX>studyState(54*30).returnX);
 assert.equal(studyState(6*30).returning,0);
 assert.ok(studyState(54*30).position[2]<studyState(52*30).position[2]);
});

import {filmState} from './film-state';
import filmCues from './film-cue-sheet.json';
test('whole film has six distinct worlds followed by travelers-only finale',()=>{
 assert.equal(new Set(filmCues.worlds.map(w=>w.id)).size,6);
 for(let frame=0;frame<7199;frame++){
  const s=filmState(frame);assert.ok(s.position.every(Number.isFinite));
  assert.equal(s.finale,frame>=6344);
  if(frame%97===0){filmState(7198);assert.deepEqual(filmState(frame),s);}
 }
 for(const w of filmCues.worlds){
  assert.ok(w.start<=w.entry[0]&&w.entry[0]<w.entry[1]);
  assert.ok(w.entry[1]<w.exit[0]&&w.exit[0]<w.exit[1]&&w.exit[1]<=w.end);
  const a=filmState(Math.round((w.entry[1]+1)*30));
  const b=filmState(Math.round((w.exit[0]-.1)*30));assert.ok(b.position[2]<a.position[2]);
 }
});
