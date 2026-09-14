import test from 'node:test';
import assert from 'node:assert/strict';
import {detectCategory,categoryPatch,categoryStartError} from '../server/lib/category.js';
test('product category recognizes supplements and electronics without selected category bias',()=>{
 for(const name of ['저분자 피쉬 콜라겐','콜 라 겐 스틱','Collagen peptides','콘드로이친 1200','락토페린'])assert.equal(detectCategory({name}),'health',name);
 for(const name of ['무선 청소기','보조배터리','에어프라이어'])assert.equal(detectCategory({name}),'digital',name);
 assert.equal(detectCategory({name:'콜라겐 마스크팩'}),null);
 assert.equal(detectCategory({name:'콜라겐 크림'}),null);
 assert.equal(detectCategory({name:'선물세트'}),null);
 assert.equal(detectCategory({name:'ABC 120',categoryText:'콜라겐 하루 1포 섭취'}),'health');
 assert.equal(detectCategory({name:'ABC 120',description:'가전제품 정격전압 220V 청소기'}),'digital');
 assert.equal(detectCategory({name:'무선 청소기',description:'비타민 영양제 증정'}),'digital');
 assert.equal(detectCategory({name:'세트',description:'청소기와 콜라겐'}),null);
});

test('Onest collagen corrects digital selection and preserves requested category',()=>{
 const patch=categoryPatch({category:'digital',product:{name:'트리플콜라겐 오렌지 24주 (9+3박스)',brand:'(주)오니스트'}});
 assert.equal(patch.category,'health');assert.equal(patch.requestedCategory,'digital');
 assert.equal(patch.product.detectedCategory,'health');
 assert.equal(categoryPatch({category:'digital',product:{name:'알 수 없는 세트'}}).category,'digital');
});

test('promotional titles and uncertain products do not silently use selected category',()=>{
 const name='유튜브광고 전용 비밀링크 아침공복 지중해 루틴, 올레정';
 assert.equal(categoryPatch({category:'digital',product:{name}}).category,'health');
 assert.ok(categoryStartError({category:'digital',product:{name:'비밀링크 특가'}}));
 assert.equal(categoryStartError({category:'digital',product:{name:'비밀링크',categoryText:'올리브오일 하루 1포 섭취'}}),null);
});

import {toPublicJob} from '../server/lib/jobStore.js';
test('category findings and original selection reach the popup',()=>{
 const job={id:'fixture',category:'digital',product:{name:'콜라겐',images:[]}};
 const result=toPublicJob({...job,...categoryPatch(job)});
 assert.equal(result.category,'health');
 assert.equal(result.requestedCategory,'digital');
 assert.equal(result.product.detectedCategory,'health');
});
