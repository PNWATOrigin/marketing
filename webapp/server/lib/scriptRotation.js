import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomInt} from 'node:crypto';
import {config} from '../config.js';
export function nextScriptVariant(product,count=10){
 const file=path.join(config.dataDir,'script-rotation.json');
 let state={};try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const key=createHash('sha256').update(String(product.name||product.sourceUrl)).digest('hex');
 const index=Number.isInteger(state[key])?(state[key]+1)%count:randomInt(count);
 delete state[key];state[key]=index;
 state=Object.fromEntries(Object.entries(state).slice(-1000));
 fs.mkdirSync(config.dataDir,{recursive:true});
 fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);
 return index;
}
