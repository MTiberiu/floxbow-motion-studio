/**
 * Scoped install: only adds village scene to the local ignored cinematic project.
 * Usage: npx tsx scripts/install-journey-construction.ts
 * Does NOT touch WAV/media/Timeline/subtitle files or shared FloxBow modules.
 */
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const dir=resolve(root,'projects/mai-departe-cinematic-v1/scenes');
const target=resolve(dir,'JourneyWorld.tsx');
const destination=resolve(dir,'JourneyConstruction.tsx');
const source=resolve(root,'examples/capabilities/luminous-gateway/JourneyConstruction.tsx');
const abort=(why:string):never=>{throw new Error('[Journey Construction] '+why);};
if(!existsSync(target)||!existsSync(source))abort('Missing local project or source; check branch and project folder.');
const before=readFileSync(target,'utf8');
if(before.includes("import {JourneyConstruction}")||before.includes("import { JourneyConstruction }")){
 console.log('Journey Construction is already installed. Nothing changed.');
 process.exit(0);
}
if(existsSync(destination))abort('Destination already exists; refusing to overwrite.');
if(!before.includes('<ThreeCanvas')||!before.includes('</ThreeCanvas>'))abort('Expected ThreeCanvas scene not found. No files changed.');
if(!/export function JourneyWorld\s*\(\s*\{\s*time\s*,/.test(before))abort('Unexpected JourneyWorld signature. No files changed.');
const backup=target+'.before-journey-construction.bak';
if(existsSync(backup))abort('Backup already exists; refusing to overwrite.');
const closing=before.lastIndexOf('</ThreeCanvas>');
const updated="import { JourneyConstruction } from './JourneyConstruction';\n"+
 before.slice(0,closing)+"      <JourneyConstruction time={time} />\n      "+before.slice(closing);
copyFileSync(target,backup);
writeFileSync(destination,readFileSync(source,'utf8'),'utf8');
writeFileSync(target,updated,'utf8');
console.log('Installed village construction inside JourneyWorld reveal.');
console.log('Backup: '+backup);
console.log('Audio, subtitles, lyrics and edit-timeline remain untouched.');
console.log('Preview at seconds 5, 12, 20, 28.');
