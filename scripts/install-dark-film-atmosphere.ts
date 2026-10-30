/**
 * Installs an additive DARK atmosphere layer into the current local JourneyReveal.
 * Preserves existing CameraDirector, LivingEmulsion, curves, timeline and audio.
 */
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const scenes=resolve(root,'projects/mai-departe-cinematic-v1/scenes');
const target=resolve(scenes,'JourneyReveal.tsx');
const destination=resolve(scenes,'DarkFilmAtmosphere.tsx');
const source=resolve(root,'examples/capabilities/film-reveal-v1/DarkFilmAtmosphere.tsx');
const fail=(m:string):never=>{throw new Error('[Dark Film] '+m);};
if(!existsSync(target)||!existsSync(source))fail('Missing project scene or tracked source. Check current branch.');
const original=readFileSync(target,'utf8');
if(original.includes("import { DarkFilmAtmosphere }")){console.log('Already installed. No files changed.');process.exit(0);}
if(existsSync(destination))fail('Local DarkFilmAtmosphere.tsx already exists; refusing overwrite.');
const anchor='<FilmLifeOverlay time={time} amount={0.75} />';
if(!original.includes(anchor)||!original.includes('<CameraDirector frame={frame}')||!original.includes('buildEmulsion(time, speed, revealX)'))
 fail('Local JourneyReveal has unknown structure. No files changed.');
const backup=target+'.before-dark-atmosphere.bak';
if(existsSync(backup))fail('Backup already exists; refusing to overwrite.');
const replacement="import { DarkFilmAtmosphere } from './DarkFilmAtmosphere';\n"+
 original.replace(anchor,anchor+"\n      <DarkFilmAtmosphere time={time} intensity={1} />");
copyFileSync(target,backup);
writeFileSync(destination,readFileSync(source,'utf8'),'utf8');
writeFileSync(target,replacement,'utf8');
console.log('Installed DARK atmosphere. Backup: '+backup);
console.log('Modified only JourneyReveal.tsx; added DarkFilmAtmosphere.tsx.');
console.log('Audio, Timeline, Living Emulsion, Camera Director untouched.');
