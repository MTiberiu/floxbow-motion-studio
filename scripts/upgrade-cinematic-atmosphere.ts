/**
 * Upgrade only the project-local CinematicPlate visual component.
 * Guarded by recognizable previous source; no audio, Timeline or lyrics edits.
 * Usage: npx tsx scripts/upgrade-cinematic-atmosphere.ts
 */
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const target=resolve(root,'projects/mai-departe-cinematic-v1/scenes/CinematicPlate.tsx');
const source=resolve(root,'examples/capabilities/film-reveal-v1/CinematicPlate.tsx');
function fail(s:string):never{throw new Error('[Cinematic atmosphere] '+s);}
if(!existsSync(source)||!existsSync(target))fail('Missing source or installed CinematicPlate. Install previous cinematic plate first.');
const old=readFileSync(target,'utf8');
const replacement=readFileSync(source,'utf8');
if(old===replacement){console.log('Atmosphere already up to date.');process.exit(0);}
if(!old.includes('export function CinematicPlate')||
   !old.includes("import filmValley from '../assets/film-valley.png'")||
   !old.includes('cinemaWaterGlint'))fail('Unknown local version; refusing to overwrite.');
if(!replacement.includes('cinemaValleyFog')||!replacement.includes('bridgeLightGlow'))fail('Source missing expected effects.');
const backup=target+'.before-atmosphere-v2.bak';
if(existsSync(backup))fail('Backup already exists, will not overwrite: '+backup);
copyFileSync(target,backup);
writeFileSync(target,replacement,'utf8');
console.log('Updated CinematicPlate: moving fog, bridge lights, lake glints.');
console.log('Backup: '+backup);
console.log('No changes to soundtrack, Timeline, subtitles or other project files.');
