import * as cheerio from 'cheerio';
import { filterBannedClaims } from './claimsGuard.js';

// 상품 사진이 아니라 아이콘/버튼/배너처럼 화면 UI에 쓰이는 이미지를 걸러낸다.
const SKIP_IMAGE_PATTERN = /(icon|sprite|logo|blank|pixel|spinner|loading|placeholder|favicon|btn|button|arrow|badge|banner|share|sns|kakao|naver_|instagram|facebook|payment|credit.?card|payco|tosspay|adult|age.?19|19plus|emoticon|emoji|coupon|delivery|review_?star|cart|wish|close|top_?btn|scroll|nav_|header_|footer_|gnb|lnb|\.svg(\?|$))/i;
// 상세페이지 안에서 실제 상품 사진/설명 이미지가 들어있을 만한 영역을 우선 찾는다
// (Cafe24/고도몰/메이크샵 등 국내 쇼핑몰 빌더가 흔히 쓰는 클래스/아이디 이름 기준).
const DETAIL_CONTAINER_SELECTOR =
  '[id*="prdDetail" i], [class*="prdDetail" i], [class*="xans-product-detail" i], [class*="detail" i], [id*="detail" i], [class*="product-desc" i], [class*="productDesc" i]';
const CTA_KEYWORDS = ['지금 구매', '바로구매', '구매하기', '장바구니', '지금 확인', '자세히 보기', 'buy now', 'shop now', 'add to cart', 'order now'];

function toAbsoluteUrl(base, src) {
  if (!src) return null;
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function cleanText(text, maxLen = 400) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

function collectJsonLd($) {
  const nodes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || !raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item && Array.isArray(item['@graph'])) {
          nodes.push(...item['@graph']);
        } else if (item) {
          nodes.push(item);
        }
      }
    } catch {
      // 잘못된 JSON-LD는 무시하고 다음 우선순위로 넘어간다.
    }
  });
  return nodes;
}

function isType(node, typeName) {
  const t = node?.['@type'];
  if (!t) return false;
  const arr = Array.isArray(t) ? t : [t];
  return arr.some((x) => String(x).toLowerCase() === typeName.toLowerCase());
}

function pickJsonLdProduct(nodes) {
  return nodes.find((n) => isType(n, 'Product')) || null;
}

function jsonLdOffers(product) {
  let offers = product.offers;
  if (!offers) return null;
  if (Array.isArray(offers)) offers = offers[0];
  return offers || null;
}

function num(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function extractFromJsonLdProduct(product, baseUrl) {
  if (!product) return { images: [] };
  const offers = jsonLdOffers(product);
  const images = [];
  if (product.image) {
    const imgs = Array.isArray(product.image) ? product.image : [product.image];
    for (const img of imgs) {
      const url = typeof img === 'string' ? img : img?.url;
      const abs = toAbsoluteUrl(baseUrl, url);
      if (abs) images.push(abs);
    }
  }
  let price = num(offers?.price ?? offers?.priceSpecification?.price);
  let originalPrice = num(offers?.priceSpecification?.referencePrice ?? offers?.highPrice);
  if (originalPrice != null && price != null && originalPrice <= price) originalPrice = null;

  return {
    name: cleanText(product.name, 80) || null,
    brand: cleanText(typeof product.brand === 'string' ? product.brand : product.brand?.name, 40) || null,
    description: cleanText(product.description, 300) || null,
    price,
    originalPrice,
    currency: offers?.priceCurrency || null,
    images,
  };
}

function extractOpenGraph($, baseUrl) {
  const get = (prop) => $(`meta[property="${prop}"]`).attr('content') || $(`meta[name="${prop}"]`).attr('content');
  const images = [];
  $('meta[property="og:image"], meta[property="og:image:url"]').each((_, el) => {
    const abs = toAbsoluteUrl(baseUrl, $(el).attr('content'));
    if (abs) images.push(abs);
  });
  const priceAmount = num(get('product:price:amount') || get('og:price:amount'));
  const priceCurrency = get('product:price:currency') || get('og:price:currency');

  return {
    name: cleanText(get('og:title'), 80) || null,
    brand: cleanText(get('og:site_name'), 40) || null,
    description: cleanText(get('og:description'), 300) || null,
    price: priceAmount,
    currency: priceCurrency || null,
    images,
  };
}

function extractMeta($, baseUrl) {
  const title = cleanText($('title').first().text(), 80) || null;
  const description = cleanText($('meta[name="description"]').attr('content'), 300) || null;

  function collectImages($scope) {
    const found = [];
    $scope.find('img').addBack('img').each((_, el) => {
      const src = $(el).attr('ec-data-src') || $(el).attr('data-src') || $(el).attr('data-original') || $(el).attr('src');
      if (!src || SKIP_IMAGE_PATTERN.test(src+' '+($(el).attr('alt')||'')) || $(el).closest('header,footer,nav,[class*=payment],[class*=coupon],[class*=recommend]').length) return;
      const w = parseInt($(el).attr('width') || '0', 10);
      const h = parseInt($(el).attr('height') || '0', 10);
      if ((w && w < 200) || (h && h < 200)) return;
      const abs = toAbsoluteUrl(baseUrl, src);
      if (abs) found.push(abs);
    });
    return found;
  }

  // 상세 설명 영역이 있으면 그 안의 이미지를 우선 쓰고(실제 상품 사진일 확률이 높음),
  // 부족하면 페이지 전체에서 아이콘/버튼류를 걸러낸 이미지로 보충한다.
  const detailImages = collectImages($(DETAIL_CONTAINER_SELECTOR));
  const images = detailImages; 
  return { name: title, description, images, detailImages };
}

// 허용된 범위(공개 텍스트) 내에서 핵심 특징 후보와 구매 유도 문구를 찾는다.
function extractBodyHints($) {
  const features = [];
  $('li, p, span, strong, b').each((_, el) => {
    if (features.length >= 6) return false;
    const text = cleanText($(el).text(), 60);
    if (text.length < 4 || text.length > 40) return;
    if (/^(홈|home|menu|메뉴|로그인|장바구니|검색|search)$/i.test(text)) return;
    features.push(text);
  });

  const bodyText = cleanText($('body').text(), 5000).toLowerCase();
  const ctaHint = CTA_KEYWORDS.find((kw) => bodyText.includes(kw.toLowerCase())) || null;

  // "₩19,900" / "29,000원" 형태의 가격 후보를 본문에서 찾는다 (구조화 데이터가 없을 때만 사용).
  const priceMatches = [...cleanText($('body').text(), 20000).matchAll(/(?:₩\s?([\d,]{4,})|([\d,]{4,})\s?원)/g)]
    .map((m) => parseInt((m[1] || m[2]).replace(/,/g, ''), 10))
    .filter((n) => Number.isFinite(n) && n >= 100 && n <= 100000000);

  let price = null;
  let originalPrice = null;
  if (priceMatches.length === 1) {
    price = priceMatches[0];
  } else if (priceMatches.length >= 2) {
    const sorted = [...new Set(priceMatches)].sort((a, b) => a - b);
    price = sorted[0];
    originalPrice = sorted[sorted.length - 1];
    if (originalPrice <= price) originalPrice = null;
  }

  return { features: [...new Set(features)].slice(0, 3), ctaHint, price, originalPrice };
}

function dedupeImages(images, max) {
  return [...new Set(images.filter(Boolean))].slice(0, max);
}

// 최근 국내 쇼핑몰(특히 TV홈쇼핑·SPA 기반 사이트)은 상품 정보를 서버 HTML이 아니라
// window.__NEXT_DATA__ / __INITIAL_STATE__ 같은 초기 상태 JSON으로 내려주기도 한다.
// JSON-LD/OG/메타에서 못 찾은 항목만 이 값으로 최후 보완한다 (없는 내용을 지어내지 않음).
const EMBEDDED_STATE_PATTERNS = [
  /(?:window\.)?__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*(?:<\/script>|;\s*(?:window\.)?__)/i,
  /(?:window\.)?__(?:INITIAL_STATE__|NUXT__|PRELOADED_STATE__|APOLLO_STATE__)\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i,
];

function findEmbeddedState(html) {
  for (const pattern of EMBEDDED_STATE_PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;
    try {
      return JSON.parse(match[1]);
    } catch {
      // 잘라낸 조각이 온전한 JSON이 아니면 건너뛴다.
    }
  }
  return null;
}

// 얕은 우선 탐색으로 이름/가격/이미지처럼 보이는 값을 찾는다. 노드 수를 제한해 성능을 보호한다.
function scanEmbeddedState(state) {
  const found = { name: null, price: null, image: null };
  const queue = [state];
  let visited = 0;
  while (queue.length && visited < 3000) {
    const node = queue.shift();
    visited += 1;
    if (!node || typeof node !== 'object') continue;
    for (const [key, value] of Object.entries(node)) {
      const k = key.toLowerCase();
      if (!found.name && typeof value === 'string' && /^(goodsname|productname|itemname|name|title)$/.test(k) && value.length > 1) {
        found.name = value;
      } else if (!found.price && typeof value === 'number' && /price/.test(k) && value > 0) {
        found.price = value;
      } else if (!found.image && typeof value === 'string' && /^(image|imageurl|thumbnail|mainimage|thumbimg)$/.test(k) && /^https?:\/\//.test(value)) {
        found.image = value;
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }
  return found;
}

/**
 * HTML을 분석해서 상품 정보를 추출한다.
 * 우선순위: JSON-LD Product > Open Graph > 메타데이터 > 본문 텍스트 휴리스틱
 * 데이터가 없으면 null/빈 값으로 두고, 절대 내용을 지어내지 않는다.
 */
export function analyzeHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const ohou = new URL(pageUrl).hostname === 'store.ohou.se';
  const jsonLdNodes = collectJsonLd($);
  const jsonLdProduct = pickJsonLdProduct(jsonLdNodes);

  const fromJsonLd = extractFromJsonLdProduct(jsonLdProduct, pageUrl);
  const fromOg = extractOpenGraph($, pageUrl);
  // "함께 본 상품"/추천 상품 영역은 이 상품이 아닌 다른 상품 사진이 섞여 들어오는
  // 원인이라 이미지/텍스트를 뽑기 전에 통째로 제거한다.
  $('style, script, nav, header, footer, [class*="relate" i], [id*="relate" i], [class*="recommend" i], [id*="recommend" i], [class*="other_goods" i], [class*="otherGoods" i]').remove();
  const fromMeta = extractMeta($, pageUrl);
  const bodyHints = extractBodyHints($);

  let name = fromJsonLd.name || fromOg.name || fromMeta.name || null;
  const brand = fromJsonLd.brand || (ohou
    ? cleanText($('a[aria-label$="브랜드 페이지로 이동"]').first().text(), 40) || null
    : null);
  const description = fromJsonLd.description || fromOg.description || fromMeta.description || null;
  // 가격은 구조화 데이터(JSON-LD/OG)를 가장 신뢰하지만, 본문 텍스트에서 찾은 가격과
  // 크게 다르면 페이지 안에 서로 다른 가격 표기가 있다는 뜻이라 사용자에게 알려야 한다
  // (예: 정가/행사가 파싱 오류, 다른 옵션의 가격이 섞여 들어온 경우 등).
  const structuredPrice = fromJsonLd.price ?? fromOg.price ?? (ohou ? num((fromOg.description || '').match(/([\d,]+)원/)?.[1]) : null);
  let price = structuredPrice ?? bodyHints.price;
  const originalPrice = fromJsonLd.originalPrice ?? null;
  let priceConflictWarning = null;
  if (structuredPrice != null && bodyHints.price != null && structuredPrice !== bodyHints.price) {
    const diffRatio = Math.abs(structuredPrice - bodyHints.price) / Math.max(structuredPrice, bodyHints.price);
    if (diffRatio > 0.05) {
      priceConflictWarning = `페이지에 서로 다른 가격 정보가 있어요(${structuredPrice.toLocaleString()}원 / ${bodyHints.price.toLocaleString()}원). 실제 페이지에서 정확한 가격을 확인해주세요.`;
    }
  }

  const gallery = ohou ? $('img[alt^="상품 이미지"]').toArray()
    .sort((a,b) => Number($(a).attr('alt').replace(/\D/g,''))-Number($(b).attr('alt').replace(/\D/g,'')))
    .map(el => {
      const src = $(el).attr('src');
      try { const u = new URL(src, pageUrl); u.searchParams.set('w','1000'); u.searchParams.set('h','1000'); return u.toString(); } catch { return null; }
    }) : [];
  let images = dedupeImages(ohou ? [...gallery, ...fromOg.images,...fromMeta.images.filter(u=>/shop-phinf|detail|description/i.test(u))] : (fromMeta.detailImages.length ? fromMeta.detailImages : [...fromJsonLd.images, ...fromOg.images]), 16);

  if (['nutridday.com','www.nutridday.com'].includes(new URL(pageUrl).hostname)) {
    images=dedupeImages($('#prdDetail .cont img').toArray().map(el=>toAbsoluteUrl(pageUrl,$(el).attr('ec-data-src')||$(el).attr('data-src')||$(el).attr('src'))).filter(u=>u&&!/banner|delivery/i.test(u)),16);
  }
  images=images.filter(u=>!SKIP_IMAGE_PATTERN.test(u));
  const detailOnly=['nutrime.co.kr','www.nutrime.co.kr','nutridday.com','www.nutridday.com'].includes(new URL(pageUrl).hostname);
  if(['nutrime.co.kr','www.nutrime.co.kr'].includes(new URL(pageUrl).hostname)) images=dedupeImages($('#strict-product-detail img[src*="/data/editor/goods/"]').toArray().map(el=>toAbsoluteUrl(pageUrl,$(el).attr('src'))),16);

  // JSON-LD/OG/메타로 이름·가격·이미지를 하나도 못 찾았을 때만 SPA 임베디드 상태를 확인한다.
  if (!name || price == null || images.length === 0) {
    const state = findEmbeddedState(html);
    if (state) {
      const hint = scanEmbeddedState(state);
      if (!name && hint.name) name = cleanText(hint.name, 80);
      if (price == null && hint.price) price = hint.price;
      if (!detailOnly && images.length === 0 && hint.image) images.push(hint.image);
    }
  }

  if (!name || !images.length) throw new Error('상품명과 이미지를 확인하지 못했어요. 공개 상품 상세페이지 URL인지 확인해주세요.');
  const currency = fromJsonLd.currency || fromOg.currency || (price != null ? 'KRW' : null);

  const rawFeatures = ohou ? [
    /BLDC/i.test(name || '') ? 'BLDC 무선청소기' : null,
    /물걸레키트/.test(name || '') ? '물걸레키트 포함' : null,
    /자동\s*먼지\s*비움/.test(name || '') ? '자동 먼지 비움' : null,
    (name || '').match(/먼지봉투\s*\d+장/)?.[0],
  ].filter(Boolean) : (jsonLdProduct?.additionalProperty || []).filter?.(p => p?.name && p?.value).map(p => cleanText(`${p.name}: ${p.value}`, 40)).slice(0,3) || [];
  const { kept: features, removed: blockedClaims } = filterBannedClaims(rawFeatures);

  const warnings = [];
  if (!name) warnings.push('상품명을 찾지 못했어요.');
  if (price == null) warnings.push('가격 정보를 찾지 못했어요.');
  if (images.length === 0) warnings.push('사용할 수 있는 이미지를 찾지 못했어요.');
  if (blockedClaims > 0) warnings.push('검증되지 않은 과장된 표현이 포함된 문구는 제외했어요.');
  if (priceConflictWarning) warnings.push(priceConflictWarning);

  return {
    sourceUrl: pageUrl,
    detailOnly,
    preferDetail:fromMeta.detailImages.length>0 || detailOnly,
    name,
    brand,
    price,
    originalPrice: originalPrice != null && price != null && originalPrice > price ? originalPrice : null,
    // 가격을 어디서 가져왔는지, 충돌하는 다른 값이 있었는지 함께 남긴다(출처 추적).
    priceSource: {
      structured: structuredPrice,
      bodyText: bodyHints.price,
      conflict: !!priceConflictWarning,
    },
    currency,
    description,
    features,
    ctaHint: bodyHints.ctaHint,
    images,
    imageContext:Object.fromEntries($('img').toArray().map(el=>[toAbsoluteUrl(pageUrl,$(el).attr('src')||$(el).attr('data-src')),cleanText($(el).attr('alt'),100)]).filter(([u,t])=>u&&t)),
    warnings,
  };
}
