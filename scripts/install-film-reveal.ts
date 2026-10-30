/**
 * Upgrade local cinematic reveal to the dark-film variant.
 * Does not touch media, edit-timeline.json, audio, subtitle data or JourneyWorld.
 * Refuses unknown source shapes. Creates a backup first.
 */
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const project=resolve(root,'projects/mai-departe-cinematic-v1/scenes');
const target=resolve(project,'JourneyReveal.tsx');
const source=resolve(root,'examples/capabilities/film-reveal-v1/JourneyReveal.tsx');
function stop(message:string):never{throw new Error('[Film Reveal] '+message);}
if(!existsSync(target))stop('Lipseste scena locala: '+target);
if(!existsSync(source))stop('Lipseste sursa. Ruleaza git pull.');
const before=readFileSync(target,'utf8');
const replacement=readFileSync(source,'utf8');
if(before===replacement){console.log('Film Reveal deja instalat.');process.exit(0);}
if(!before.includes('function buildWorldMask(')||!before.includes('export const journeyRevealModule')||!before.includes("import guides from '../motion-guides.json'")){
 stop('Fisierul local difera de structura asteptata. Oprire fara modificari. Trimite eroarea, nu suprascrie manual.');
}
if(!replacement.includes('function emulsionEdge(')||!replacement.includes('Film') && !replacement.includes('edgePath(')){
 stop('Sursa pentru upgrade nu a fost verificata.');
}
const backup=target+'.before-film-reveal.bak';
if(existsSync(backup))stop('Backup deja existent: '+backup+'. Nu-l suprascriu.');
copyFileSync(target,backup);
writeFileSync(target,replacement,'utf8');
console.log('Instalat Dark Film Reveal in '+target);
console.log('Backup: '+backup);
console.log('Niciun fisier audio/timeline/subtitle modificat.');
console.log('Deschide Electron, Reload preview, verifica sec. 3, 10, 20, 28.');
