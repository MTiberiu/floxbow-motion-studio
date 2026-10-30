import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const patch=JSON.parse(fs.readFileSync(new URL('integration.json',import.meta.url),'utf8'));
const path=new URL('Composition.tsx',root);
const hash=s=>crypto.createHash('sha256').update(s.toString().replaceAll('\r\n','\n')).digest('hex');
const current=fs.readFileSync(path);
if(hash(current)===patch.after)console.log('Already installed; no files changed.');
else {
 if(hash(current)!==patch.before)throw new Error('Composition differs from reviewed baseline. Refusing overwrite; integrate the two imports and lyrics binding manually.');
 if(hash(patch.content)!==patch.after)throw new Error('Integration payload failed checksum.');
 if(process.argv.includes('--apply')){
  fs.writeFileSync(new URL('Composition.before-portal-study.local.bak',root),current,{flag:'wx'});
  fs.writeFileSync(path,patch.content);console.log('Installed with exclusive backup:',fileURLToPath(path));
 }else console.log('Compatible. Add --apply to install with backup.');
}
