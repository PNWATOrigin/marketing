import test from 'node:test';
import assert from 'node:assert/strict';
import {selectOcrPaths} from '../server/lib/ocrSampling.js';
test('long first image cannot crowd out other sources or their last cuts', () => {
 const files=Array.from({length:30},(_,i)=>`img_0_slice${i}.jpg`).concat(['img_1.jpg','img_2_slice0.jpg','img_2_slice1.jpg']);
 const selected=selectOcrPaths(files,6);
 assert.deepEqual(selected,['img_0_slice0.jpg','img_1.jpg','img_2_slice0.jpg','img_0_slice29.jpg','img_2_slice1.jpg','img_0_slice15.jpg']);
 assert.equal(new Set(selected).size,6);
});
test('empty and single-image inputs remain bounded',()=>{
 assert.deepEqual(selectOcrPaths([]),[]);
 assert.deepEqual(selectOcrPaths(['img_0.jpg']),['img_0.jpg']);
});
