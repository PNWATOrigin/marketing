import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapCaption,simplifyCaptionProduct,captionProductName} from '../server/lib/captionText.js';
test('captions preserve whole words and normalize spaces',()=>{
 assert.equal(wrapCaption('  상품의   구성을 확인해 보세요 '),'상품의 구성을\n확인해 보세요');
 assert.equal(wrapCaption('아주긴단어도중간을자르지않아요'),'아주긴단어도중간을자르지않아요');
});
test('long health names in source captions become a generic product name',()=>{
 const p={name:'트리플콜라겐 오렌지 24주 (9+3박스)'};
 assert.equal(simplifyCaptionProduct(p.name+'을 확인해요',p,'health'),'콜라겐을 확인해요');
 assert.equal(simplifyCaptionProduct(p.name.replace(/ /g,'')+' 추천',p,'health'),'콜라겐 추천');
 assert.equal(simplifyCaptionProduct('칼슘 함량 확인',p,'health'),'칼슘 함량 확인');
 assert.equal(simplifyCaptionProduct(p.name,p,'digital'),p.name);
});

test('product keywords prefer title over unrelated page content',()=>{
 assert.equal(captionProductName({name:'어린이 우유칼슘 초유 성장기 영양제 칼마디 아연',detailLines:['콜라겐 추천']},'health'),'칼슘');
 assert.equal(captionProductName({name:'브랜드 프리미엄 프로바이오틱스 6개월 구성'},'health'),'유산균');
 assert.equal(captionProductName({name:'브랜드 스페셜 패키지 12개월 구성',detailLines:['관련 상품 콜라겐 추천']},'health'),'영양제');
 assert.equal(captionProductName({name:'브랜드 스페셜 패키지 12개월 구성',detailLines:['주원료: 루테인']},'health'),'루테인');
 assert.equal(captionProductName({name:'홍삼'},'health'),'홍삼');
});
