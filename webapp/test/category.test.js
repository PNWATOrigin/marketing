import test from 'node:test';
import assert from 'node:assert/strict';
import {detectCategory} from '../server/lib/category.js';
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
