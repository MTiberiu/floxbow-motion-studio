import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {transitionAt,RETURN_START,RETURN_END,PAPER_END} from './RiftPushTransition';

test('original entry is kept outside the returning-rift director',()=>{
 assert.equal(transitionAt(240).phase,'entry');
 assert.equal(transitionAt(450).phase,'world');
});
test('travelers push the world to the right, then paper follows behind them',()=>{
 const start=transitionAt(RETURN_START);
 const middle=transitionAt(750);
 const overlap=transitionAt(800);
 const worldOut=transitionAt(RETURN_END);
 const paperOut=transitionAt(PAPER_END);
 assert.equal(start.returnProgress,0);
 assert.ok(middle.returnEdge.x>start.returnEdge.x);
 assert.ok(overlap.paperEdge.x>0);
 assert.ok(overlap.returnEdge.x>overlap.paperEdge.x);
 assert.equal(worldOut.phase,'paper');
 assert.equal(worldOut.returnProgress,1);
 assert.equal(paperOut.phase,'paper-full');
 assert.equal(paperOut.paperProgress,1);
});
test('stable camera seeks and distinct rift contours',()=>{
 for(const f of [0,240,450,689,690,750,780,800,809,810,900,930,1080]){
  assert.deepEqual(transitionAt(f),transitionAt(f));
  const r=transitionAt(f);
  for(const edge of [r.returnEdge,r.paperEdge]){
   assert.ok(edge.path.startsWith('M'));
   assert.ok(edge.left.startsWith('polygon('));
   assert.ok(edge.right.startsWith('polygon('));
   assert.equal(edge.path.includes('NaN'),false);
  }
 }
});
