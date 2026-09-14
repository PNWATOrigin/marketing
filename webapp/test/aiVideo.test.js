import test from 'node:test';
import assert from 'node:assert/strict';
import {runwayRequest,addAiClips} from '../server/lib/aiVideo.js';
test('AI is off by default and keeps original source shots',async()=>{
 const before=process.env.AI_VIDEO_ENABLED;delete process.env.AI_VIDEO_ENABLED;
 try{const b={shots:[{imagePath:'original.jpg'}]};await addAiClips(b,'unused');assert.equal(b.visualMode,'source-photos');assert.equal(b.shots[0].imagePath,'original.jpg');}finally{if(before!==undefined)process.env.AI_VIDEO_ENABLED=before;}
});
test('Runway uses fixed endpoint, version and JSON body without live requests',async()=>{
 const result=await runwayRequest('image_to_video',{model:'gen4_turbo',duration:5},async(url,options)=>{
 assert.equal(url,'https://api.dev.runwayml.com/v1/image_to_video');assert.equal(options.method,'POST');assert.equal(options.headers['X-Runway-Version'],'2024-11-06');assert.equal(JSON.parse(options.body).duration,5);return {ok:true,json:async()=>({id:'mock'})};
 });assert.equal(result.id,'mock');
 await assert.rejects(runwayRequest('tasks/mock',undefined,async()=>({ok:false,status:401})),/401/);
});
