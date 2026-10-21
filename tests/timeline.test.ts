import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {parseEditTimeline,changeClipRange,validateField} from '@motion/sdk/timeline';
import {exportSubtitles,importSubtitles,subtitleClips,subtitlesToSRT,subtitlesToLRC} from '@motion/lyrics-sync/subtitles';
import {manifestSchema} from '@motion/project-loader/schema';
import {readEditor,saveEditor} from '../scripts/editor-store';
const fixture=async()=>parseEditTimeline(JSON.parse(await readFile('projects/gi-go-lo/edit-timeline.json','utf8')));
test('timeline moves on frame boundaries and trimming keeps spoken word positions',async()=>{
 const t=await fixture();const moved=changeClipRange(t,'chorus-1',30,210);const c=moved.clips.find(c=>c.id==='chorus-1')!;
 assert.equal(c.from,30);assert.deepEqual(c.content.words,t.clips[1].content.words);
 const trim=changeClipRange(t,'chorus-1',30,180,true).clips[1];const w=(trim.content.words as {start:number;end:number}[])[1];assert.equal(w.start+trim.from/t.fps,2);assert.equal(trim.durationInFrames,150);
 assert.throws(()=>parseEditTimeline({...t,clips:[{...t.clips[0],from:500}]}));assert.throws(()=>parseEditTimeline({...t,clips:[t.clips[0],t.clips[0]]}));
});
test('subtitle timing is independent from styling; JSON/SRT/LRC preserve documented semantics',async()=>{
 const t=await fixture();const data=exportSubtitles(t);const styled=structuredClone(t);styled.clips[1].props={color:'#ff0000',animation:'rise',fontFamily:'Georgia'};assert.deepEqual(exportSubtitles(styled),data);
 const json=importSubtitles(JSON.stringify(data),'json',12);assert.deepEqual(json,data);assert.equal(json.segments[1].content.repeatOf,'chorus-1');assert.equal(json.segments[0].content.words?.[1].start,2);
 const clips=subtitleClips(json,t,'lyrics',{fontSize:90});assert.equal(clips[1].from,180);assert.equal(clips[0].props.fontSize,90);
 const srt=importSubtitles(subtitlesToSRT(data),'srt',12);assert.equal(srt.segments[1].end,12);assert.equal(srt.segments[1].content.text,'GI GO LO');assert.equal(srt.segments[0].content.words,undefined);
 const lrc=importSubtitles(subtitlesToLRC(data),'lrc',12);assert.equal(lrc.segments[1].start,6);
 const repeats=importSubtitles('[00:00.00][00:06.00]Chorus','lrc',12);assert.equal(repeats.segments.length,2);
 assert.throws(()=>importSubtitles('1\n00:00:04,000 --> 00:00:01,000\nNo','srt',12));assert.throws(()=>subtitleClips({...data,segments:[{...data.segments[0],end:20}]},t,'lyrics'));
});
test('declared property controls validate their values',()=>{
 const f={key:'size',label:'Size',target:'props' as const,type:'number' as const,default:40,min:12,max:120};assert.equal(validateField(f,64),64);assert.throws(()=>validateField(f,-1));assert.throws(()=>validateField(f,NaN));
});
test('project saves are validated, persistent and reject stale agent revisions',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'motion-editor-'));try{
 const t=await fixture();await writeFile(path.join(dir,'edit.json'),JSON.stringify(t));const m=manifestSchema.parse({id:'fixture',name:'Fixture',type:'lyrics',width:1920,height:1080,fps:30,durationInFrames:360,entry:'Composition.tsx',editTimeline:'edit.json',sdkVersion:'0.1.0'});
 const disk=await readEditor(dir,m);const next=changeClipRange(t,'chorus-1',15,180);const saved=await saveEditor(dir,m,next,disk.revision);assert.equal(saved.timeline.clips[1].from,15);assert.notEqual(saved.revision,disk.revision);await assert.rejects(saveEditor(dir,m,t,disk.revision),/CONFLICT/);
 await assert.rejects(saveEditor(dir,m,{...t,fps:60},saved.revision),/match/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
