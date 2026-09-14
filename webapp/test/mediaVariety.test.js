import test from 'node:test';
import assert from 'node:assert/strict';
import {makeStoryboard} from '../server/lib/storyboard.js';
import {resolveFonts} from '../server/lib/render/fonts.js';
test('fresh product images are preferred even when one matches every cue',()=>{
 const assets=Array.from({length:5},(_,i)=>({id:String(i),path:'/img'+i+'.jpg',type:'DETAIL',text:i?'다른 상품 사진':'청소 흡입',tags:i?[]:['청소','흡입'],quality:1,visibility:1,composition:1}));
 const b=makeStoryboard({narration:{duration:15,sceneBoundaries:[0,3,6,9,12,15],words:Array.from({length:5},(_,i)=>({start:i*3,end:i*3+3,text:'청소 흡입'}))},assets,category:'digital',purpose:'views',product:{name:'청소기'}});
 assert.equal(new Set(b.shots.map(s=>s.assetId)).size,5);
});
test('cute font variants resolve to different bundled fonts',()=>{assert.notEqual(resolveFonts(0).bold,resolveFonts(1).bold);});
test('four caption fonts rotate for every example',()=>{for(const purpose of ['views','sales','brand']){assert.equal(new Set([0,1,2,3].map(v=>resolveFonts(v,purpose).bold)).size,4);assert.equal(resolveFonts(0,purpose).bold,resolveFonts(4,purpose).bold);}});
