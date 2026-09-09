export const PURPOSES = {
  views: {
    id: 'views',
    label: '조회수 확보형',
    metrics: ['조회수', '시청 유지율', '공유 수'],
  },
  sales: {
    id: 'sales',
    label: '판매 전환형',
    metrics: ['클릭률', '구매 전환율', '매출'],
  },
  brand: {
    id: 'brand',
    label: '브랜드 인지도형',
    metrics: ['브랜드 검색량', '도달률', '팔로워 증가', '재방문'],
  },
};

function formatPrice(amount, currency) {
  if (amount == null) return null;
  if (!currency || currency === 'KRW') return `${Math.round(amount).toLocaleString('ko-KR')}원`;
  const symbol = { USD: '$', JPY: '¥', EUR: '€' }[currency] || `${currency} `;
  return `${symbol}${amount.toLocaleString('ko-KR')}`;
}

function discountPercent(price, originalPrice) {
  if (price == null || originalPrice == null || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 100);
}

// 받침 유무에 따라 올바른 조사를 고른다 (예: 이/가, 은/는, 을/를, 와/과).
function josa(word, [withBatchim, withoutBatchim]) {
  if (!word) return withoutBatchim;
  const lastChar = word.trim().slice(-1);
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return withoutBatchim;
  const hasBatchim = (code - 0xac00) % 28 !== 0;
  return hasBatchim ? withBatchim : withoutBatchim;
}

function firstClause(text, maxLen = 26) {
  if (!text) return null;
  const clause = text.split(/[.!?。\n]/)[0].trim();
  if (!clause) return null;
  return clause.length > maxLen ? `${clause.slice(0, maxLen - 1)}…` : clause;
}

// 실제로 확인된 특징이 있으면 그것을 쓰고, 없으면 사실을 지어내지 않는 선에서
// 스타일 문구(장식적 문구)로만 대체한다.
function pickBenefits(product, count) {
  const list = [...product.features];
  const generic = ['꼼꼼하게 준비한 구성', '지금 주목받는 이유', '고민 없이 선택하는 이유'];
  while (list.length < count) {
    const extra = firstClause(product.description, 30);
    if (extra && !list.includes(extra)) {
      list.push(extra);
    } else {
      list.push(generic[list.length % generic.length]);
    }
  }
  return list.slice(0, count);
}

function hookScene(product, purposeId) {
  const name = product.name || '이 상품';
  const brand = product.brand;
  let badge;
  let headline;
  let sub;
  if (purposeId === 'views') {
    badge = 'HOT';
    headline = '이거 실화임?';
    sub = name;
  } else if (purposeId === 'sales') {
    badge = product.price != null ? 'SALE' : 'PICK';
    headline = name;
    sub = '지금 이 순간, 주목';
  } else {
    badge = 'BRAND';
    headline = brand || name;
    sub = brand ? name : '당신을 위한 선택';
  }
  return { key: 'hook', start: 0, end: 2, duration: 2, badge, headline, sub };
}

function problemScene(product, purposeId, start, end) {
  const hint = firstClause(product.description, 34);
  let headline;
  let sub;
  if (purposeId === 'views') {
    headline = '다들 이거 때문에 고민하죠';
    sub = hint || '나만 몰랐던 이야기';
  } else if (purposeId === 'sales') {
    headline = '이런 고민, 있지 않으셨나요?';
    sub = hint || '더 나은 선택이 필요할 때';
  } else {
    headline = product.brand ? `${product.brand}${josa(product.brand, ['이', '가'])} 던지는 질문` : '당연한 게 당연하지 않다면';
    sub = hint || '작은 차이가 만드는 변화';
  }
  return { key: 'problem', start, end, duration: end - start, headline, sub };
}

function benefitScenes(product, purposeId, start, end, count) {
  const benefits = pickBenefits(product, count);
  const each = (end - start) / count;
  return benefits.map((text, i) => {
    const sceneStart = +(start + each * i).toFixed(2);
    const sceneEnd = i === count - 1 ? end : +(sceneStart + each).toFixed(2);
    let headline = text;
    if (purposeId === 'sales') headline = `✓ ${text}`;
    if (purposeId === 'views') headline = `POINT ${i + 1}. ${text}`;
    return {
      key: `benefit${i + 1}`,
      start: sceneStart,
      end: sceneEnd,
      duration: +(sceneEnd - sceneStart).toFixed(2),
      headline,
    };
  });
}

function trustScene(product, purposeId, start, end) {
  const price = formatPrice(product.price, product.currency);
  const originalPrice = formatPrice(product.originalPrice, product.currency);
  const pct = discountPercent(product.price, product.originalPrice);

  let headline;
  let sub;
  let emphasis;
  if (purposeId === 'sales') {
    if (price && originalPrice) {
      headline = `${originalPrice} → ${price}`;
      emphasis = pct != null ? `${pct}% 할인` : price;
    } else if (price) {
      headline = price;
      sub = '지금 가격, 합리적인 선택';
      emphasis = price;
    } else {
      headline = '지금 구매할 이유가 있어요';
      sub = '믿을 수 있는 선택';
    }
  } else if (purposeId === 'views') {
    headline = '이미 화제인 이유가 있어요';
    sub = product.brand ? `${product.brand} 인기 아이템` : '다들 찾는 바로 그 아이템';
    emphasis = 'REAL';
  } else {
    headline = product.brand ? `${product.brand}만의 신뢰` : '변하지 않는 가치';
    sub = product.name || '한결같은 약속';
    emphasis = product.brand || undefined;
  }
  return { key: 'trust', start, end, duration: end - start, headline, sub, emphasis };
}

function ctaScene(product, purposeId, start, end) {
  const price = formatPrice(product.price, product.currency);
  let headline;
  let sub;
  let emphasis;
  if (purposeId === 'sales') {
    headline = '지금 구매하기';
    sub = price || '지금 확인하기';
    emphasis = price || '구매';
  } else if (purposeId === 'views') {
    headline = '저장은 필수';
    sub = '공유해서 친구에게 알려주기';
    emphasis = 'SAVE';
  } else {
    headline = product.brand ? `${product.brand} 기억하기` : '우리를 기억해주세요';
    sub = '팔로우하고 새 소식 받기';
  }
  return { key: 'cta', start, end, duration: end - start, headline, sub, emphasis };
}

/**
 * 15초 영상 타임라인(HOOK → 문제 제시 → 핵심 장점 → 신뢰/혜택 → CTA)을 생성한다.
 * 목적(purposeId)에 따라 문구 톤과 구성이 달라진다.
 * 실제로 확인된 상품 데이터만 사용하고, 데이터가 없으면 일반적인 스타일 문구로 대체한다(사실 날조 금지).
 */
export function generateScript(product, purposeId) {
  if (!PURPOSES[purposeId]) {
    throw new Error(`알 수 없는 목적입니다: ${purposeId}`);
  }
  const featureCount = product.features.length >= 3 ? 3 : 2;

  const hook = hookScene(product, purposeId);
  const problem = problemScene(product, purposeId, 2, 5);
  const benefits = benefitScenes(product, purposeId, 5, 11, featureCount);
  const trust = trustScene(product, purposeId, 11, 13);
  const cta = ctaScene(product, purposeId, 13, 15);

  const scenes = [hook, problem, ...benefits, trust, cta];
  const totalDuration = +scenes.reduce((sum, s) => sum + s.duration, 0).toFixed(2);

  return { purpose: purposeId, totalDuration, scenes };
}
