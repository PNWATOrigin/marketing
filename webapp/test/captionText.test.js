import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapCaption,simplifyCaptionProduct} from '../server/lib/captionText.js';
test('captions preserve whole words and normalize spaces',()=>{
 assert.equal(wrapCaption('  상품의   구성을 확인해 보세요 '),'상품의 구성을\n확인해 보세요');
 assert.equal(wrapCaption('아주긴단어도중간을자르지않아요'),'아주긴단어도중간을자르지않아요');
});
test('long health names in source captions become a generic product name',()=>{
 const p={name:'트리플콜라겐 오렌지 24주 (9+3박스)'};
 assert.equal(simplifyCaptionProduct(p.name+'을 확인해요',p,'health'),'영양제를 확인해요');
 assert.equal(simplifyCaptionProduct(p.name.replace(/ /g,'')+' 추천',p,'health'),'영양제 추천');
 assert.equal(simplifyCaptionProduct('칼슘 함량 확인',p,'health'),'칼슘 함량 확인');
 assert.equal(simplifyCaptionProduct(p.name,p,'digital'),p.name);
});
