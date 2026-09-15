import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCategory,detectCategory,categoryPatch,categoryStartError} from '../server/lib/category.js';
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

test('nutrition foods join app health category without treating sugar claims as a category',()=>{
 for(const name of ['제로핵 고단백 단백질 무당 그래놀라 2종','고단백 그래 놀라','무당 시리얼','단백질바','고단백 간식'])assert.equal(detectCategory({name}),'health');
 assert.equal(detectCategory({name:'무당 저당 특가'}),null);
 assert.equal(detectCategory({name:'단백질 샴푸'}),null);
 assert.equal(detectCategory({name:'무선 청소기',description:'고단백 그래놀라 증정'}),'digital');
 assert.equal(categoryStartError({category:'health',product:{name:'제로핵 고단백 단백질 무당 그래놀라 2종'}}),null);
});

test('apple cider vinegar food titles join health but skincare does not',()=>{
 for(const name of ['🛍️사은품증정🛍️ [WELLNESS-CLUB] 애사비 블러드오렌지 클렌즈','애플 사이다 비니거','사과초모식초'])assert.equal(classifyCategory({name}).category,'health');
 assert.equal(classifyCategory({name:'애사비 클렌징 토너'}).category,null);
 assert.equal(classifyCategory({name:'블러드오렌지 향수'}).category,null);
});

test('growth ingredients plus ingestible form establish health category',()=>{
 assert.equal(classifyCategory({name:'[NEW] 에스클래스 그로우업 맥스 키성장 HSy2 28포(4주분)',description:'성장기 기초 영양 9중 복합 기능성 사과맛 젤리 스틱'}).category,'health');
 assert.equal(classifyCategory({name:'키성장 운동 기구'}).category,null);
 assert.equal(classifyCategory({name:'사과맛 젤리 스틱'}).category,null);
 assert.equal(classifyCategory({name:'HSy2 크림'}).category,null);
});

test('a-cd ingredient needs oral-product evidence; Dida collaboration title is recognized',()=>{
 assert.equal(detectCategory({name:'디다샷 X 츠키',description:'미국 화제 신성분 a-cd 초고함량 Dida shot'}),'health');
 assert.equal(detectCategory({name:'알파시클로덱스트린 분말'}),'health');
 assert.equal(detectCategory({name:'a-cd 원료'}),null);
 assert.equal(detectCategory({name:'a-cd 크림',description:'샷'}),null);
 assert.equal(detectCategory({name:'디다샷 X 츠키'}),null);
 assert.equal(detectCategory({name:'무선 청소기',description:'a-cd 샷'}),'digital');
});

test('health evidence combines title form with description ingredients',()=>{
 for(const ingredient of ['비오틴','엽산','프로폴리스','테아닌','식이섬유','MSM']){
 assert.equal(detectCategory({name:'데일리 캡슐',description:ingredient+' 함유'}),'health');
 assert.equal(detectCategory({name:'크림',description:ingredient+' 함유'}),null);
 }
 assert.equal(detectCategory({name:'데일리 케어',description:'건강기능식품'}),'health');
 assert.equal(detectCategory({name:'건강 베개',description:'편안한 수면'}),null);
 assert.equal(detectCategory({name:'젤리'}),null);
 assert.equal(detectCategory({name:'선물',description:'청소기와 비오틴 캡슐'}),null);
});
