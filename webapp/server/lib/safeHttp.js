import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { assertSafeUrlFormat, isPrivateIp, UnsafeUrlError } from './ssrf.js';

const USER_AGENT = 'ShortformAdStudio/1.0 (+product-url-analyzer)';

// 이미 한국어로 작성된, 그대로 사용자에게 보여줘도 되는 오류.
export class SafeHttpError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SafeHttpError';
  }
}

// http/https 모듈에 커스텀 lookup을 넘겨서, 실제로 TCP 연결이 맺어지는 IP까지
// 사설 대역인지 검증한다 (DNS 리바인딩으로 검증을 우회하는 것을 막기 위함).
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    const safe = list.find((a) => !isPrivateIp(a.address));
    if (!safe) {
      callback(new UnsafeUrlError('내부/사설 IP로 연결되는 주소는 접근할 수 없어요.'));
      return;
    }
    if (options.all) {
      callback(null, list.filter((a) => !isPrivateIp(a.address)));
    } else {
      callback(null, safe.address, safe.family);
    }
  });
}

/**
 * SSRF 방어가 적용된 안전한 GET 요청.
 * - http/https만 허용, 리디렉션은 매번 재검증하며 수동으로 따라감
 * - 응답 크기 제한 (초과 시 즉시 중단)
 * - 타임아웃 적용
 */
export async function safeFetch(rawUrl, { timeoutMs = 10000, maxBytes = 3 * 1024 * 1024, maxRedirects = 5, accept } = {}) {
  let currentUrl = rawUrl;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const url = assertSafeUrlFormat(currentUrl);
    const result = await singleRequest(url, { timeoutMs, maxBytes, accept });
    if (result.status >= 300 && result.status < 400 && result.location) {
      currentUrl = new URL(result.location, url).toString();
      continue;
    }
    return { ...result, finalUrl: url.toString() };
  }
  throw new UnsafeUrlError('리디렉션이 너무 많아요.');
}

function singleRequest(url, { timeoutMs, maxBytes, accept }) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept || 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location: res.headers.location, headers: res.headers, body: Buffer.alloc(0) });
          return;
        }
        const chunks = [];
        let total = 0;
        let aborted = false;
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total > maxBytes) {
            aborted = true;
            res.destroy();
            reject(new SafeHttpError('응답 크기가 너무 커요.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (aborted) return;
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks) });
        });
        res.on('error', (err) => {
          if (!aborted) reject(err);
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new SafeHttpError('요청 시간이 초과됐어요.'));
    });
    req.on('error', reject);
    req.end();
  });
}
