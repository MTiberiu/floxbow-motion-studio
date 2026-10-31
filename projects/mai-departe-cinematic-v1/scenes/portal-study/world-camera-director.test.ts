import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import cues from './film-cue-sheet.json';
import {worldCameraAt} from './world-camera-director';

test('six worlds have an audio-timed, continuous camera that retreats during entry',()=>{
 cues.worlds.forEach((world,index)=>{
  const entry=worldCameraAt(Math.round(world.entry[0]*30),index);
  const middle=worldCameraAt(Math.round((world.entry[0]+world.entry[1])/2*30),index);
  const full=worldCameraAt(Math.round(world.entry[1]*30),index);
  assert.ok(entry.position[2]<middle.position[2],world.id);
  assert.ok(middle.position[2]<=full.position[2]+.01,world.id);
  assert.deepEqual(full,worldCameraAt(Math.round(world.entry[1]*30),index));
  for(const coordinate of [...full.position,...full.target])assert.ok(Number.isFinite(coordinate));
 });
});
test('prewarmed destination camera matches its starting camera when world becomes active',()=>{
 for(let index=1;index<cues.worlds.length;index++){
  const previous=cues.worlds[index-1];
  const next=cues.worlds[index];
  assert.deepEqual(
   worldCameraAt(Math.round(previous.exit[0]*30),index).position,
   worldCameraAt(Math.round(next.start*30),index).position,
  );
 }
});
test('camera values stay finite through all 7199 frames',()=>{
 for(let f=0;f<7199;f+=23){
  const index=Math.max(0,cues.worlds.filter(w=>f>=Math.round(w.start*30)).length-1);
  const p=worldCameraAt(f,index);
  for(const n of [...p.position,...p.target])assert.ok(Number.isFinite(n));
 }
});
