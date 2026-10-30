/**
 * Installs the illustrated landscape and evolving dark film in the local
 * ignored project. Preserve the entire project timeline and soundtrack.
 *
 * PRECONDITION: put a licensed/generated image at
 *   projects/mai-departe-cinematic-v1/assets/film-valley.png
 *
 * Usage: npx tsx scripts/install-cinematic-plate.ts
 */
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const dir=resolve(root,'projects/mai-departe-cinematic-v1');
const scenes=resolve(dir,'scenes');
const plateSource=resolve(root,'examples/capabilities/film-reveal-v1/CinematicPlate.tsx');
const filmSource=resolve(root,'examples/capabilities/film-reveal-v1/JourneyReveal.tsx');
const plateTarget=resolve(scenes,'CinematicPlate.tsx');
const worldTarget=resolve(scenes,'JourneyWorld.tsx');
const revealTarget=resolve(scenes,'JourneyReveal.tsx');
const asset=resolve(dir,'assets/film-valley.png');
function stop(msg:string):never {throw new Error('[Cinematic plate] '+msg);}
for(const file of [plateSource,filmSource,worldTarget,revealTarget]){
 if(!existsSync(file))stop('Missing required file: '+file);
}
if(!existsSync(asset))stop('Missing PNG: '+asset+'. Save the cinematic illustration there before installing.');
const world=readFileSync(worldTarget,'utf8');
const reveal=readFileSync(revealTarget,'utf8');
const nextReveal=readFileSync(filmSource,'utf8');
const nextPlate=readFileSync(plateSource,'utf8');
const worldAlready=world.includes("import { CinematicPlate } from './CinematicPlate'");
const revealAlready=reveal===nextReveal;
if(worldAlready && revealAlready && existsSync(plateTarget)){
 console.log('Cinematic film already installed. No changes.');process.exit(0);
}
if(worldAlready || existsSync(plateTarget))stop('Partial/unknown prior install. Refusing to overwrite local changes.');
if(!world.includes('<ThreeCanvas')||!world.includes('</ThreeCanvas>')||
 !world.includes('export function JourneyWorld({time,speed,maskImage}'))stop('Unexpected JourneyWorld shape. No modifications.');
if(!reveal.includes("import guides from '../motion-guides.json'")||
 !reveal.includes('export const journeyRevealModule')||
 !reveal.includes('function emulsionEdge('))stop('Expected DARK film reveal already installed. Run install-film-reveal.ts first.');
if(!nextReveal.includes('untraveledFilm')||!nextPlate.includes('film-valley.png'))stop('Unexpected production source.');
const pos=world.lastIndexOf('</ThreeCanvas>');
const patchedWorld="import { CinematicPlate } from './CinematicPlate';\n"+
 world.slice(0,pos+14)+"\n      <CinematicPlate time={time} />"+
 world.slice(pos+14);
const backups=[worldTarget+'.before-cinematic-plate.bak',revealTarget+'.before-moving-film.bak'];
if(backups.some(existsSync))stop('A backup already exists. No overwrite.');
// All preflight checks passed; now touch the two visual scenes only.
copyFileSync(worldTarget,backups[0]);
copyFileSync(revealTarget,backups[1]);
writeFileSync(plateTarget,nextPlate,'utf8');
writeFileSync(worldTarget,patchedWorld,'utf8');
writeFileSync(revealTarget,nextReveal,'utf8');
console.log('Installed cinematic illustrated landscape and evolving film.');
console.log('Backups: '+backups.join(' / '));
console.log('Unchanged: media registry, WAV, Timeline, subtitles, lyrics, song analysis.');
console.log('Reload Electron preview. Seek to 3s, 10s, 20s, 28s, then back to 10s.');
