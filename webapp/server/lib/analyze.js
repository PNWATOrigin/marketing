import * as cheerio from 'cheerio';

const SKIP_IMAGE_PATTERN = /(icon|sprite|logo|blank|pixel|spinner|loading|placeholder|favicon|\.svg(\?|$))/i;
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
  const images = [];
  $('img').each((_, el) => {
    if (images.length >= 12) return;
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (!src || SKIP_IMAGE_PATTERN.test(src)) return;
    const w = parseInt($(el).attr('width') || '0', 10);
    const h = parseInt($(el).attr('height') || '0', 10);
    if ((w && w < 120) || (h && h < 120)) return;
    const abs = toAbsoluteUrl(baseUrl, src);
    if (abs) images.push(abs);
  });
  return { name: title, description, images };
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

/**
 * HTML을 분석해서 상품 정보를 추출한다.
 * 우선순위: JSON-LD Product > Open Graph > 메타데이터 > 본문 텍스트 휴리스틱
 * 데이터가 없으면 null/빈 값으로 두고, 절대 내용을 지어내지 않는다.
 */
export function analyzeHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const jsonLdNodes = collectJsonLd($);
  const jsonLdProduct = pickJsonLdProduct(jsonLdNodes);

  const fromJsonLd = extractFromJsonLdProduct(jsonLdProduct, pageUrl);
  const fromOg = extractOpenGraph($, pageUrl);
  const fromMeta = extractMeta($, pageUrl);
  const bodyHints = extractBodyHints($);

  const name = fromJsonLd.name || fromOg.name || fromMeta.name || null;
  const brand = fromJsonLd.brand || fromOg.brand || null;
  const description = fromJsonLd.description || fromOg.description || fromMeta.description || null;
  const price = fromJsonLd.price ?? fromOg.price ?? bodyHints.price ?? null;
  const originalPrice = fromJsonLd.originalPrice ?? bodyHints.originalPrice ?? null;
  const currency = fromJsonLd.currency || fromOg.currency || (price != null ? 'KRW' : null);

  const images = dedupeImages([...fromJsonLd.images, ...fromOg.images, ...fromMeta.images], 12);

  const warnings = [];
  if (!name) warnings.push('상품명을 찾지 못했어요.');
  if (price == null) warnings.push('가격 정보를 찾지 못했어요.');
  if (images.length === 0) warnings.push('사용할 수 있는 이미지를 찾지 못했어요.');

  return {
    sourceUrl: pageUrl,
    name,
    brand,
    price,
    originalPrice: originalPrice != null && price != null && originalPrice > price ? originalPrice : null,
    currency,
    description,
    features: bodyHints.features,
    ctaHint: bodyHints.ctaHint,
    images,
    warnings,
  };
}
