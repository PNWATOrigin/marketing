import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {backgroundPrompt,generateLabBackground,cloudflareReady} from '../server/lib/cloudflareBackground.js';
test('background prompt only uses validated palette and preset mood',()=>{const p=backgroundPrompt(['#ffaa22','bad input'],'unknown',1);assert.match(p,/#ffaa22/);assert.doesNotMatch(p,/bad input/);assert.match(p,/No products/);});
test('Cloudflare response is validated, failures cannot become fake generated backgrounds',async()=>{
 const oldId=process.env.CLOUDFLARE_ACCOUNT_ID,oldToken=process.env.CLOUDFLARE_API_TOKEN;
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lab-cloudflare-'));
 try{delete process.env.CLOUDFLARE_API_TOKEN;assert.equal(cloudflareReady(),false);await assert.rejects(()=>generateLabBackground({palette:[],mood:'clean',outputPath:path.join(dir,'image.jpg')}));
 process.env.CLOUDFLARE_ACCOUNT_ID='a'.repeat(32);process.env.CLOUDFLARE_API_TOKEN='test';
 const args={palette:['#ffffff'],mood:'clean',variant:0,outputPath:path.join(dir,'image.jpg')};
 await assert.rejects(()=>generateLabBackground({...args,fetcher:async()=>({ok:false,status:429})}),/한도/);
 await assert.rejects(()=>generateLabBackground({...args,fetcher:async()=>({ok:true,json:async()=>({success:true,result:{image:Buffer.from('bad').toString('base64')}})})}),/손상/);
 await generateLabBackground({...args,fetcher:async(url,options)=>{assert.match(url,/flux-1-schnell/);assert.equal(JSON.parse(options.body).steps,4);return {ok:true,json:async()=>({success:true,result:{image:Buffer.from([255,216,255,224]).toString('base64')}})};}});
 assert.ok((await fs.stat(args.outputPath)).size>0);
 }finally{if(oldId===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;else process.env.CLOUDFLARE_ACCOUNT_ID=oldId;if(oldToken===undefined)delete process.env.CLOUDFLARE_API_TOKEN;else process.env.CLOUDFLARE_API_TOKEN=oldToken;await fs.rm(dir,{recursive:true,force:true});}
});
