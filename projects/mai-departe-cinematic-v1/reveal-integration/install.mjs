import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('../scenes/JourneyReveal.tsx',import.meta.url));
const patch=JSON.parse(fs.readFileSync(new URL('./patch.json',import.meta.url),'utf8'));
const source=fs.readFileSync(target,'utf8');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
if(source.includes('data-living-emulsion')||source.includes('const {maskImage, edge: boundary, area} = buildEmulsion')){
 console.log('Living Emulsion already integrated; no files written.');process.exit(0);
}
if(digest(source)!==patch.sha256)throw Error('Integration stopped: JourneyReveal differs from reviewed baseline. Review patch.json manually; no files written.');
let next=source;
for(const [from,to] of patch.changes){if(next.split(from).length!==2)throw Error('Ambiguous integration anchor; no files written.');next=next.replace(from,to);}
if(process.argv.includes('--check')){console.log('Baseline matches. Six scoped changes ready; no files written.');process.exit(0);}
fs.writeFileSync(target+'.before-living-emulsion.bak',source,{flag:'wx'});
fs.writeFileSync(target,next);
console.log('Integrated; original preserved in JourneyReveal.tsx.before-living-emulsion.bak');
