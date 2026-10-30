import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arrivalTime,frontierX,buildEmulsion,frontierParticle} from '../scenes/emulsion-field.ts';
const speed=1920/55,revealX=1000-6.5*speed;
test('arrival field is monotone; material cannot disappear in film coordinates',()=>{
 for(let y=82;y<=800;y+=19)for(let x=-300;x<10000;x+=11)assert.ok(arrivalTime(x+1,y,speed,revealX)>arrivalTime(x,y,speed,revealX));
});
test('contour solves arrival field across song and horizon range',()=>{
 for(const s of [19.2,speed,96])for(const t of [0,20,55,120,239])for(let y=82;y<=800;y+=7){const x=frontierX(t,y,s,revealX);assert.ok(Math.abs(arrivalTime(x+t*s,y,s,revealX)-t)<.00001);}
});
test('seek order cannot change geometry or particle state',()=>{
 const expected=JSON.stringify([buildEmulsion(20,speed,revealX),frontierParticle(21,20,speed,revealX)]);
 for(const t of [0,100,3,21,19.99]){buildEmulsion(t,speed,revealX);frontierParticle(21,t,speed,revealX);}
 assert.equal(JSON.stringify([buildEmulsion(20,speed,revealX),frontierParticle(21,20,speed,revealX)]),expected);
});
test('frontier has no frame jumps and preserves readable world',()=>{
 for(let t=0;t<240;t+=.5)for(let y=82;y<=800;y+=23){const x=frontierX(t,y,speed,revealX);assert.ok(x>revealX-260&&x<revealX+260);assert.ok(Math.abs(x-frontierX(t+1/30,y,speed,revealX))<1);}
});
