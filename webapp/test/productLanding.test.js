import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHtml} from '../server/lib/analyze.js';
test('product landing scope supplies images instead of social logo',()=>{
 const p=analyzeHtml('<title>Shop</title><meta property="og:image" content="/logo.jpg"><header><img src="/unrelated.jpg"></header><div class="model_product-container"><h1>Model X</h1><p class="model_product-desc">물걸레 청소 시스템</p><p class="model_card-title">강력한 흡입력</p><picture><img src="/product.jpg"></picture></div>','https://example.com/pages/model');
 assert.equal(p.name,'Model X');assert.deepEqual(p.images,['https://example.com/product.jpg']);assert.deepEqual(p.features,['강력한 흡입력']);
});
test('unscoped page images are not mistaken for product photos',()=>{
 assert.throws(()=>analyzeHtml('<title>Shop</title><img src="/unrelated.jpg">','https://example.com/'));
});
