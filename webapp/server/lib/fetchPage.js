import { fetchOhouPage } from './ohouFetch.js';
import { config } from '../config.js';
import { safeFetch, SafeHttpError } from './safeHttp.js';
import { UnsafeUrlError } from './ssrf.js';

export class PageFetchError extends Error {
  constructor(message, code = 'FETCH_FAILED') {
    super(message);
    this.name = 'PageFetchError';
    this.code = code;
  }
}

// 소켓/DNS 등 저수준 오류 메시지가 그대로 사용자 화면에 노출되지 않도록 한국어 문구로 바꾼다.
const NETWORK_ERROR_MESSAGES = {
  ECONNREFUSED: '연결이 거부됐어요. 주소를 다시 확인해주세요.',
  ENOTFOUND: '주소를 찾을 수 없어요. 올바른 URL인지 확인해주세요.',
  EAI_AGAIN: '주소를 찾을 수 없어요. 잠시 후 다시 시도해주세요.',
  ECONNRESET: '연결이 끊어졌어요. 잠시 후 다시 시도해주세요.',
  ETIMEDOUT: '페이지를 불러오는 데 시간이 너무 오래 걸려요.',
  EHOSTUNREACH: '해당 주소에 연결할 수 없어요.',
  ENETUNREACH: '해당 주소에 연결할 수 없어요.',
  CERT_HAS_EXPIRED: '이 사이트의 보안 인증서에 문제가 있어요.',
};

function toFriendlyFetchError(err) {
  if (err instanceof PageFetchError) return err;
  if (err instanceof UnsafeUrlError) return new PageFetchError(err.message, 'UNSAFE_URL');
  if (err instanceof SafeHttpError) return new PageFetchError(err.message, 'FETCH_FAILED');
  const friendly = NETWORK_ERROR_MESSAGES[err?.code];
  return new PageFetchError(friendly || '페이지를 불러오지 못했어요. URL을 다시 확인해주세요.', 'FETCH_FAILED');
}

// HTTP 헤더에 charset이 없으면 <meta charset=...> 선언을 찾는다. charset 이름 자체는
// 항상 ASCII라서, 실제 인코딩을 모르는 상태에서도 원본 바이트를 latin1으로 읽어 안전하게
// 찾아낼 수 있다.
function sniffCharsetFromMeta(body) {
  const head = body.subarray(0, Math.min(body.length, 4096)).toString('latin1');
  const match = /<meta[^>]+charset=["']?\s*([\w-]+)/i.exec(head);
  return match?.[1]?.trim().toLowerCase();
}

// 국내 쇼핑몰(특히 오래된 자사몰)은 여전히 EUC-KR로 서비스하는 경우가 많다. EUC-KR은
// 한글을 2바이트로 표현하는 인코딩이라 latin1(1바이트=1문자)로 읽으면 글자가 깨진다 -
// TextDecoder로 실제 EUC-KR 디코딩을 해야 한다.
function decodeBody(body, contentType) {
  const headerCharset = /charset=([^;]+)/i.exec(contentType || '')?.[1]?.trim().toLowerCase();
  const charset = headerCharset || sniffCharsetFromMeta(body) || 'utf-8';
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return body.toString('utf-8');
  }
}

export async function fetchProductPage(url, { timeoutMs = config.analyzeTimeoutMs, maxBytes = config.maxHtmlBytes } = {}) {
  const target = new URL(url);
  if (target.hostname === 'store.ohou.se') {
    try { return await fetchOhouPage(url, { timeoutMs, maxBytes }); }
    catch { throw new PageFetchError('오늘의집 상품 페이지를 읽지 못했어요. 잠시 후 다시 시도해주세요.', 'FETCH_FAILED'); }
  }
  let res;
  try {
    res = await withTimeout(
      safeFetch(url, { timeoutMs, maxBytes, accept: 'text/html,application/xhtml+xml' }),
      timeoutMs,
      '페이지를 불러오는 데 시간이 너무 오래 걸려요.'
    );
  } catch (err) {
    throw toFriendlyFetchError(err);
  }

  if (res.status >= 400) {
    throw new PageFetchError(`페이지를 불러올 수 없어요. (HTTP ${res.status})`, 'HTTP_ERROR');
  }
  const contentType = res.headers['content-type'] || '';
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
    throw new PageFetchError('상품 페이지(HTML)가 아닌 주소예요.', 'NOT_HTML');
  }
  let html = decodeBody(res.body, contentType);
  if (['nutrime.co.kr','www.nutrime.co.kr'].includes(target.hostname) && target.pathname==='/goods/view') {
    const detailUrl=new URL('/goods/view_contents',target); detailUrl.searchParams.set('no',target.searchParams.get('no')||''); detailUrl.searchParams.set('zoom','1');
    const detail=await safeFetch(detailUrl.toString(),{timeoutMs,maxBytes,accept:'text/html'});
    if(detail.status>=400)throw new PageFetchError('상세설명 이미지를 불러오지 못했어요.','FETCH_FAILED');
    html += '<section id="strict-product-detail">'+decodeBody(detail.body,detail.headers['content-type'])+'</section>';
  }
  return { html, finalUrl: res.finalUrl };
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new PageFetchError(message, 'TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
