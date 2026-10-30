/**
 * Install the Luminous Gateway in a LOCAL ignored FloxBow project.
 * Usage: npx tsx scripts/install-luminous-gateway.ts
 *
 * Carefully edits only scenes/JourneyWorld.tsx and a new scenes/LuminousGateway.tsx;
 * creates timestamp-free backups, never touches audio, media or timeline.
 */
import {readFileSync,writeFileSync,existsSync,copyFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const project=resolve(root,'projects/mai-departe-cinematic-v1');
const target=resolve(project,'scenes/JourneyWorld.tsx');
const dest=resolve(project,'scenes/LuminousGateway.tsx');
const source=resolve(root,'examples/capabilities/luminous-gateway/LuminousGateway.tsx');
function fail(message:string):never {throw new Error('[Luminous Gateway] '+message);}
if(!existsSync(target))fail('Nu exista '+target+'. Proiectul trebuie sa fie prezent local.');
if(!existsSync(source))fail('Lipseste componenta sursa. Fa git pull pe branchul activ.');
const original=readFileSync(target,'utf8');
if(original.includes('LuminousGateway')){console.log('Efectul este deja instalat. Nicio modificare.');process.exit(0);}
if(!original.includes('<ThreeCanvas')||!original.includes('</ThreeCanvas>'))fail('JourneyWorld nu contine ThreeCanvas; instalarea a fost oprita fara modificari.');
if(!/export function JourneyWorld\s*\(\s*\{\s*time\s*,/.test(original))fail('Nu am gasit semnatura JourneyWorld({time,...}). Nu modific fisierul necunoscut.');
if(existsSync(dest))fail('Componenta LuminousGateway.tsx exista deja; nu o suprascriu.');
const importLine="import { LuminousGateway } from './LuminousGateway';\n";
const marker='</ThreeCanvas>';
const position=original.lastIndexOf(marker);
const updated=importLine+original.slice(0,position)+'        <LuminousGateway time={time} />\n      '+original.slice(position);
const backup=target+'.before-luminous-gateway.bak';
if(existsSync(backup))fail('Exista deja backup '+backup+'. Nu il suprascriu.');
mkdirSync(dirname(dest),{recursive:true});
copyFileSync(target,backup);
writeFileSync(dest,readFileSync(source,'utf8'),'utf8');
writeFileSync(target,updated,'utf8');
console.log('Instalat: '+dest);
console.log('Modificat: '+target);
console.log('Backup: '+backup);
console.log('media.json, edit-timeline.json, WAV, subtitrari: NEMODIFICATE.');
console.log('Reincarca preview-ul Electron si testeaza sec. 3, 10, 20, 28.');
