import fs from 'node:fs';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('../scenes/JourneyReveal.tsx',import.meta.url));
const patch=JSON.parse(fs.readFileSync(new URL('./patch.json',import.meta.url),'utf8'));
const original=fs.readFileSync(target,'utf8'),source=original.replace(/\r\n/g,'\n');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
if(hash(source)===patch.after){console.log('Camera already installed, verified. No writes.');process.exit(0);}
if(hash(source)!==patch.before)throw Error('Unknown JourneyReveal version. No writes. Review patch.json manually.');
let next=source;for(const [a,b]of patch.changes){if(next.split(a).length!==2)throw Error('Ambiguous anchor');next=next.replace(a,b);}
if(hash(next)!==patch.after)throw Error('Patch integrity failed');
if(process.argv.includes('--check')){console.log('Camera patch compatible; no writes.');process.exit(0);}
fs.writeFileSync(target+'.before-camera-director.bak',original,{flag:'wx'});
fs.writeFileSync(target,next);console.log('Camera integrated, original backed up.');
