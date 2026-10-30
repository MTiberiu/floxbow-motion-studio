import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {portalAperture} from './PortalAperture';

const fps=30,speed=1920/55,revealX=1000-6.5*speed;
test('portal seeks are stable and it opens and closes on schedule',()=>{
 for(const frame of [0,240,270,390,450,540,690,750,809]){
  const first=portalAperture(frame,fps,speed,revealX);
  assert.deepEqual(first,portalAperture(frame,fps,speed,revealX));
 }
 assert.equal(portalAperture(100,fps,speed,revealX).open,0);
 assert.equal(portalAperture(450,fps,speed,revealX).open,1);
 assert.equal(portalAperture(810,fps,speed,revealX).open,0);
});
test('portal expands beyond full viewport and keeps a registered edge',()=>{
 const p=portalAperture(450,fps,speed,revealX);
 const xy=p.edgePoints.split(' ').map(pair=>pair.split(',').map(Number));
 assert.equal(xy.length,144);
 assert.ok(Math.min(...xy.map(v=>v[0]))<0);
 assert.ok(Math.max(...xy.map(v=>v[0]))>1920);
 assert.ok(Math.min(...xy.map(v=>v[1]))<0);
 assert.ok(Math.max(...xy.map(v=>v[1]))>1080);
});

test('burnt lip is visible only while portal contour is inside viewport',()=>{
 const beginning=portalAperture(270,fps,speed,revealX);
 const crossing=portalAperture(450,fps,speed,revealX);
 assert.ok(beginning.edgeVisible);
 assert.ok(crossing.coversViewport);
 assert.equal(crossing.edgeVisible,false);
 assert.equal(portalAperture(810,fps,speed,revealX).edgeVisible,false);
});
