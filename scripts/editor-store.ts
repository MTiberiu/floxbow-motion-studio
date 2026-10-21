import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {safeFile,type ProjectManifest} from '@motion/project-loader';
import {parseEditTimeline,type EditTimeline} from '@motion/sdk/timeline';
import {subtitleContentSchema} from '@motion/lyrics-sync/subtitles';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function readEditor(projectRoot:string,m:ProjectManifest){if(!m.editTimeline)throw new Error('This project has no editable timeline. Add editTimeline to project.json.');const file=await safeFile(projectRoot,m.editTimeline);const text=await readFile(file,'utf8');return {timeline:parseEditTimeline(JSON.parse(text),m),revision:hash(text)};}
const locks=new Map<string,Promise<unknown>>();
export async function saveEditor(projectRoot:string,m:ProjectManifest,timeline:unknown,revision:string){
 const key=path.resolve(projectRoot);const previous=locks.get(key)??Promise.resolve();
 const job=previous.catch(()=>{}).then(async()=>{
 const t=parseEditTimeline(timeline,m);for(const c of t.clips)if(c.componentId==='subtitles')subtitleContentSchema.parse(c.content);
 const current=await readEditor(projectRoot,m);if(current.revision!==revision)throw new Error('CONFLICT: The project changed on disk. Reload it before saving; your draft has been kept.');
 const file=await safeFile(projectRoot,m.editTimeline!);const temporary=file+'.'+randomUUID()+'.tmp';
 try{await writeFile(temporary,JSON.stringify(t,null,2)+'\n',{flag:'wx'});if((await readEditor(projectRoot,m)).revision!==revision)throw new Error('CONFLICT: The project changed while saving.');await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
 return readEditor(projectRoot,m);
 });locks.set(key,job);try{return await job;}finally{if(locks.get(key)===job)locks.delete(key);}
}
