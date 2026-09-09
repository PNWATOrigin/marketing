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

function decodeBody(body, contentType) {
  const match = /charset=([^;]+)/i.exec(contentType || '');
  const charset = (match?.[1] || 'utf-8').trim().toLowerCase();
  try {
    return body.toString(charset === 'euc-kr' || charset === 'ks_c_5601-1987' ? 'latin1' : charset);
  } catch {
    return body.toString('utf-8');
  }
}

export async function fetchProductPage(url, { timeoutMs = config.analyzeTimeoutMs, maxBytes = config.maxHtmlBytes } = {}) {
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
  const html = decodeBody(res.body, contentType);
  return { html, finalUrl: res.finalUrl };
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new PageFetchError(message, 'TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
