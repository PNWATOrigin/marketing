import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml } from '../server/lib/analyze.js';
import { generateScript } from '../server/lib/script.js';
import { fetchOhouPage } from '../server/lib/ohouFetch.js';

test('Ohouse isolates gallery and brand from recommendations', () => {
 const p=analyzeHtml(`<meta property="og:title" content="자동먼지비움 BLDC 청소기 + 물걸레키트"><meta property="og:site_name" content="오늘의집"><meta property="og:description" content="158,000원"><a aria-label="클래파 브랜드 페이지로 이동"><style>ignored</style>클래파</a><img alt="상품 이미지 2" src="https://cdn.example.com/b.jpg?w=72"><img alt="상품 이미지 1" src="https://cdn.example.com/a.jpg?w=72"><img src="https://cdn.example.com/unrelated.jpg"><p>배송비 5000원</p>`, 'https://store.ohou.se/goods/123');
 assert.equal(p.brand,'클래파');assert.equal(p.price,158000);assert.equal(p.originalPrice,null);
 assert.equal(p.images.length,2);assert.match(p.images[0],/a.jpg/);assert.ok(p.features.includes('물걸레키트 포함'));
});
test('three distinct 15-second scripts use five 3-second scenes',()=>{
 const product={name:'자동먼지비움 BLDC 청소기',brand:'클래파',features:['BLDC 모터','물걸레키트 포함']};
 const scripts=['views','sales','brand'].map(p=>generateScript(product,p));
 for(const s of scripts){assert.equal(s.totalDuration,15);assert.equal(s.scenes.length,5);assert.equal(s.scenes.at(-1).end,15);assert.ok(s.scenes.every(s=>s.duration===3));}
 assert.equal(new Set(scripts.map(s=>s.scenes[0].headline)).size,3);
});
test('missing images fails instead of rendering a fake product',()=>assert.throws(()=>analyzeHtml('<title>Access denied</title>','https://shop.example.com/product')));
test('fallback cannot target internal services or send credentials',async()=>{
 for(const u of ['http://127.0.0.1/','https://store.ohou.se.evil.test/goods/12','https://user:pass@store.ohou.se/goods/12','https://store.ohou.se:8443/goods/12'])
  await assert.rejects(fetchOhouPage(u,{timeoutMs:100,maxBytes:1000}));
});
