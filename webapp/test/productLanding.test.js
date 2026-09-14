import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHtml} from '../server/lib/analyze.js';
import {classifyCategory} from '../server/lib/category.js';
test('Esther goods URL uses own photos and ingredient evidence, not shared promotions',()=>{
 const p=analyzeHtml('<meta property="og:title" content="여에스더 포스파티딜세린"><img src="/goods/8759/image/detail/a.jpg"><img src="/goods/999/image/detail/b.jpg"><div class="product-desc"><img src="/common-content/banner.jpg"><img src="/detail.jpg" alt="포스파티딜세린 아연 일일섭취량"></div>','https://esthermall.co.kr/goods/goods_view.php?goodsNo=8759&mtn=promotion');
 assert.equal(classifyCategory(p).category,'health');
 assert.equal(classifyCategory({...p,name:'국민영양 제품'}).category,'health');
 assert.deepEqual(p.images,['https://esthermall.co.kr/goods/8759/image/detail/a.jpg','https://esthermall.co.kr/detail.jpg']);
});
test('product landing scope supplies images instead of social logo',()=>{
 const p=analyzeHtml('<title>Shop</title><meta property="og:image" content="/logo.jpg"><header><img src="/unrelated.jpg"></header><div class="model_product-container"><h1>Model X</h1><p class="model_product-desc">물걸레 청소 시스템</p><p class="model_card-title">강력한 흡입력</p><picture><img src="/product.jpg"></picture></div>','https://example.com/pages/model');
 assert.equal(p.name,'Model X');assert.deepEqual(p.images,['https://example.com/product.jpg']);assert.deepEqual(p.features,['강력한 흡입력']);
});
test('unscoped page images are not mistaken for product photos',()=>{
 assert.throws(()=>analyzeHtml('<title>Shop</title><img src="/unrelated.jpg">','https://example.com/'));
});

test('Nutrione hidden description and own gallery survive without other products',()=>{
 const p=analyzeHtml(`<meta property="og:title" content="비비랩 효소 밀크티맛"><meta property="og:image" content="/upload/item/1000612898/model.png">
 <div class="thumb-wrap"><img src="/upload/item/1000612898/model.png"><img src="/upload/item/1000612898/item.png"><img src="/upload/item/999/other.png"></div>
 <textarea id="item_content_textarea">&lt;p&gt;&lt;img src="/detail-one.jpg"&gt;&lt;img data-src="/detail-two.jpg" src="/placeholder.gif"&gt;&lt;img src="/detail-three.jpg"&gt;&lt;/p&gt;</textarea>
 <div class="photo-review"><img src="/review.jpg"></div><div class="recommend"><img src="/other.jpg"></div>`, 'https://www.nutrione.co.kr/item/dtl/1000612898');
 assert.deepEqual(p.images.map(u=>new URL(u).pathname),['/upload/item/1000612898/model.png','/upload/item/1000612898/item.png','/detail-one.jpg','/detail-two.jpg','/detail-three.jpg']);
 assert.equal(p.heroImages.length,2);
 assert.equal(p.preferDetail,true);
});

test('hidden detail markup on other shops retains lazy photos and removes recommendations',()=>{
 const p=analyzeHtml(`<meta property="og:title" content="상품 상세"><textarea name="product_detail">&lt;img data-original="/photo.jpg"&gt;&lt;div class="recommend"&gt;&lt;img src="/other.jpg"&gt;&lt;/div&gt;</textarea>`, 'https://example.com/product/1');
 assert.deepEqual(p.images,['https://example.com/photo.jpg']);
});
