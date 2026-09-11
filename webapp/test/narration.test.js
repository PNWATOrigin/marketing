import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTranscript, parseTimedText } from '../server/lib/narration.js';
import { makeStoryboard } from '../server/lib/storyboard.js';
import { buildNarrationPlan } from '../server/lib/render/filterGraph.js';

const words=Array.from({length:30},(_,i)=>({text:i%2?'확인해보세요.':'제품 기능',start:i*0.48+0.04,end:i*0.48+0.43}));
const assets=['PRODUCT_HERO','USAGE','DETAIL'].map((type,i)=>({id:String(i),path:`image${i}.jpg`,type,quality:1,visibility:1,composition:0.7,tags:i===1?['기능']:['제품']}));
test('timestamp validation rejects reversed, nonfinite and out of range cues',()=>{
  assert.throws(()=>validateTranscript([{start:2,end:1,text:'x'}],15));
  assert.throws(()=>validateTranscript([{start:0,end:16,text:'x'}],15));
  assert.throws(()=>validateTranscript([{start:0,end:NaN,text:'x'}],15));
  assert.throws(()=>validateTranscript([{start:0,end:2,text:'x'},{start:1,end:3,text:'y'}],15));
  assert.deepEqual(validateTranscript(parseTimedText('1\n00:00:00,250 --> 00:00:01,700\n기존 나레이션\n'),15),[{start:0.25,end:1.7,text:'기존 나레이션'}]);
});
test('storyboard follows real word boundaries, covers original audio and holds final shot',()=>{
  for(const category of ['digital','health'])for(const purpose of ['views','sales','brand']){
    const board=makeStoryboard({narration:{duration:14.72,words},assets,category,purpose,product:{name:'제품'}});
    assert.equal(board.shots.at(-1).end,14.72);
    assert.equal(board.shots.at(-1).motion,'hold');
    assert.ok(board.shots.at(-1).duration>=1.3);
    assert.ok(board.shots.slice(1).every(s=>words.some(w=>w.start===s.start)));
    assert.equal(board.qa.errors.length,0);
    assert.ok(board.shots.every(s=>s.duration!==3));
    const plan=buildNarrationPlan({scenes:board.shots,fonts:{bold:'font.ttf'},style:board.style});
    assert.equal(plan.totalDuration,14.72);
    assert.doesNotMatch(plan.filterComplex,/fade=t=out/);
  }
});
test('unusable assets fail and unverified semantic matches are disclosed',()=>{
  assert.throws(()=>makeStoryboard({narration:{duration:15,words},assets:[],product:{name:'x'}}));
  const board=makeStoryboard({narration:{duration:15,words},assets:assets.map(a=>({...a,tags:[]})),product:{name:'x'}});
  assert.ok(board.warnings.length);assert.ok(board.qa.semanticUnverified>0);
});
