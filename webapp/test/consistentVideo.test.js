import test from 'node:test';
import assert from 'node:assert/strict';
import {generateExampleScript} from '../server/lib/exampleTemplates.js';
import {splitBreathCaptions} from '../server/lib/captionText.js';
import {makeStoryboard} from '../server/lib/storyboard.js';
test('all generated captions use one short line per 1.5 second slot without repeated opener',()=>{
 for(const category of ['health','digital'])for(const purpose of ['views','sales','brand'])for(let v=0;v<10;v++){
 const s=generateExampleScript({features:['물걸레 먼지 문턱 통과 자동 세척 자동 비움 무선 접이식 하루 1회 개별 포장 젤리 분말 캡슐 성분']},purpose,category,v);
 assert.equal(s.scenes.length,5);assert.notEqual(s.scenes[0].headline,s.scenes[0].sub);
 for(const c of s.scenes){assert.equal(c.duration,3);for(const t of [c.headline,c.sub]){assert.ok([...t].length<=10,t);assert.equal(splitBreathCaptions(t,10).length,1);}}
 }
});
test('five different page sources are used before another crop of the same source',()=>{
 const assets=Array.from({length:10},(_,i)=>({id:String(i),sourceIndex:Math.floor(i/2),path:'image'+i,text:'',tags:[],type:'PRODUCT_HERO',quality:1,visibility:1,composition:1}));
 const board=makeStoryboard({narration:{duration:15,sceneBoundaries:[0,3,6,9,12,15],words:Array.from({length:5},(_,i)=>({start:i*3,end:i*3+3,text:'확인해요.'}))},assets,category:'health',purpose:'views',product:{name:'상품'}});
 assert.equal(new Set(board.shots.map(s=>assets.find(a=>a.id===s.assetId).sourceIndex)).size,5);
});

test('relevant unused photo wins over unrelated hero and photos never repeat',()=>{
 const assets=Array.from({length:5},(_,i)=>({id:String(i),sourceIndex:i,path:'image'+i,text:i===4?'물걸레':'',tags:i===4?['물걸레']:[],type:i===4?'DETAIL':'PRODUCT_HERO',quality:1,visibility:1,composition:1}));
 const input={narration:{duration:15,sceneBoundaries:[0,3,6,9,12,15],words:Array.from({length:5},(_,i)=>({start:i*3,end:i*3+3,text:i===0?'물걸레':'확인해요.'}))},assets,category:'digital',purpose:'brand',product:{name:'상품'}};
 const board=makeStoryboard(input);assert.equal(board.shots[0].assetId,'4');assert.equal(new Set(board.shots.map(s=>s.assetId)).size,5);
 for(const count of [1,2,3,4]){const short=makeStoryboard({...input,assets:assets.slice(0,count)});assert.equal(short.shots.length,count);assert.equal(new Set(short.shots.map(s=>s.assetId)).size,count);assert.equal(short.shots.at(-1).end,15);}
});
