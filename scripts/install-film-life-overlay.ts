/**
 * Safely ADD a visual overlay to the local cinematic scene.
 * Only JourneyReveal.tsx and a NEW FilmLifeOverlay.tsx; refuses unknown states.
 * Never accesses media.json, edit-timeline.json, audio, or lyric files.
 */
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const dir=resolve(root,'projects/mai-departe-cinematic-v1/scenes');
const scene=resolve(dir,'JourneyReveal.tsx');
const moduleFile=resolve(dir,'FilmLifeOverlay.tsx');
const source=resolve(root,'examples/capabilities/film-reveal-v1/FilmLifeOverlay.tsx');
const fail=(s:string):never=>{throw new Error('[Film life] '+s);};
if(!existsSync(scene)||!existsSync(source))fail('Missing cinematic project or overlay source.');
const old=readFileSync(scene,'utf8');
if(old.includes('FilmLifeOverlay')){console.log('Already installed. No changes.');process.exit(0);}
if(existsSync(moduleFile))fail('FilmLifeOverlay.tsx already exists: refusing overwrite.');
if(!old.includes('export function JourneyReveal')||!old.includes('<JourneyWorld time={time} speed={speed} maskImage={maskImage} />'))
 fail('Unknown scene structure: refusing to patch.');
const anchor='<JourneyWorld time={time} speed={speed} maskImage={maskImage} />';
const patched="import { FilmLifeOverlay } from './FilmLifeOverlay';\n"+
 old.replace(anchor,anchor+"\n      <FilmLifeOverlay time={time} amount={0.75} />");
const backup=scene+'.before-film-life.bak';
if(existsSync(backup))fail('Backup already exists. Not overwriting.');
copyFileSync(scene,backup);
writeFileSync(moduleFile,readFileSync(source,'utf8'),'utf8');
writeFileSync(scene,patched,'utf8');
console.log('FilmLifeOverlay installed. Scene backup: '+backup);
console.log('Only the two visual files were touched. Media and Timeline untouched.');
