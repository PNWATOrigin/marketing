import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateExampleScript,HOOK_SCRIPTS} from '../server/lib/exampleTemplates.js';
import {nextScriptVariant} from '../server/lib/scriptRotation.js';
import {config} from '../server/config.js';
test('ten distinct hooks retain all three 15 second formats',()=>{
 assert.equal(HOOK_SCRIPTS.length,10);
 for(const purpose of ['views','sales','brand']){
 const scripts=Array.from({length:10},(_,i)=>generateExampleScript({name:'트리플콜라겐 오렌지 24주 (9+3박스)',features:['로그인 후 쿠폰 받기','이 문장은 너무 길어서 화면에 전부 표시하기 어렵기 때문에 중간에서 자르면 안 됩니다','콜라겐 함량 확인']},purpose,'health',i));
 assert.equal(new Set(scripts.map(s=>s.scenes[0].headline)).size,10);
 for(const s of scripts){assert.equal(s.scenes.reduce((n,v)=>n+v.duration,0),15);assert.equal(s.scenes[0].sub,'콜라겐');assert.ok(!JSON.stringify(s).includes('쿠폰'));assert.ok(!JSON.stringify(s).includes('중간에서'));}
 }
});
test('same product cycles through ten before repeating, persisted on disk',()=>{
 const old=config.dataDir;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hooks-'));config.dataDir=dir;
 try{const ids=Array.from({length:11},()=>nextScriptVariant({name:'검증 상품'}));assert.equal(new Set(ids.slice(0,10)).size,10);assert.equal(ids[0],ids[10]);assert.ok(fs.existsSync(path.join(dir,'script-rotation.json')));}
 finally{config.dataDir=old;fs.rmSync(dir,{recursive:true,force:true});}
});
