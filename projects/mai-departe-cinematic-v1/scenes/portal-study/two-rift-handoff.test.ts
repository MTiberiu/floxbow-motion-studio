import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {studyState,studyTiming} from './study-state';
import {riftEdge,smooth} from '../RiftPushTransition';

test('live preview exit is timed to music data, not abandoned 23-27s demo',()=>{
 const [start,end]=studyTiming.return;
 assert.ok(start>50&&end<56);
 assert.equal(studyState(start*30).returning,0);
 assert.equal(studyState(end*30).returning,1);
});
test('second paper rift follows, does not lead, the returning travelers',()=>{
 const [start,end]=studyTiming.return;
 for(const t of [start+.7,start+1.1,start+1.5,end]){
  const travel=studyState(t*30).returning;
  const paper=smooth((t-(start+.65))/(end+.9-(start+.65)));
  assert.ok(travel>=paper,`front order reversed at ${t}`);
  const a=riftEdge(1920*travel,t*30,2);
  const b=riftEdge(1920*paper,t*30,9);
  assert.ok(a.left.startsWith('polygon('));
  assert.ok(b.path.startsWith('M'));
 }
});
