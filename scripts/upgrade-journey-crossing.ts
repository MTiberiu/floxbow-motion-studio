/**
 * Upgrade only the locally installed JourneyConstruction scene.
 * Keeps JourneyWorld, Remotion clip, audio, subtitles and Timeline untouched.
 */
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const target=resolve(root,'projects/mai-departe-cinematic-v1/scenes/JourneyConstruction.tsx');
const source=resolve(root,'examples/capabilities/luminous-gateway/JourneyConstruction.tsx');
const bail=(text:string):never=>{throw new Error('[Journey scene] '+text);};
if(!existsSync(target))bail('Scene not installed. Run npx tsx scripts/install-journey-construction.ts first.');
if(!existsSync(source))bail('Missing source. Run git pull on feat/storyboard-director-ux-v2.');
const before=readFileSync(target,'utf8');
if(before.includes('Journey Construction v2')){console.log('The Crossing is already installed.');process.exit(0);}
if(!before.includes('export function JourneyConstruction') || !before.includes('function House(')){
  bail('Existing scene has unrecognized edits. Refusing to overwrite.');
}
const backup=target+'.paint-houses.bak';
if(existsSync(backup))bail('Backup exists. Refusing to overwrite.');
const replacement=readFileSync(source,'utf8');
if(!replacement.includes('Journey Construction v2'))bail('Unexpected source content.');
copyFileSync(target,backup);
writeFileSync(target,replacement,'utf8');
console.log('Updated: '+target);
console.log('Previous scene backup: '+backup);
console.log('Only JourneyConstruction.tsx changed; audio, timeline and subtitles were not touched.');
