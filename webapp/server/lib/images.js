import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { safeFetch } from './safeHttp.js';

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

/**
 * 후보 이미지 URL 목록을 순서대로 내려받는다.
 * 하나가 실패해도(타임아웃, 404, 용량 초과, SSRF 차단 등) 나머지로 계속 진행하고
 * 성공한 로컬 파일 경로만 반환한다 - 전체 작업이 이미지 하나 때문에 실패하지 않게 한다.
 */
// DNS가 응답 없이 멈추는 등 소켓 타임아웃이 걸리지 않는 드문 경우까지 대비해,
// 요청 자체와 별개로 절대적인 마감 시간을 둔다 (이게 없으면 이미지 하나가
// 전체 "이미지 준비" 단계를 무한정 붙잡을 수 있다).
function withDeadline(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function downloadOne(url, destDir, index) {
  try {
    const res = await withDeadline(
      safeFetch(url, {
        timeoutMs: config.imageTimeoutMs,
        maxBytes: config.maxImageBytes,
        accept: 'image/*',
      }),
      config.imageTimeoutMs + 3000
    );
    if (!res || res.status >= 400) return null;
    const contentType = (res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = EXT_BY_MIME[contentType];
    if (!ext) return null; // 이미지가 아닌 응답은 건너뛴다
    if (!res.body || res.body.length < 200) return null; // 지나치게 작은(깨진) 이미지는 제외

    const filePath = path.join(destDir, `img_${index}${ext}`);
    await fs.writeFile(filePath, res.body);
    return filePath;
  } catch {
    return null; // 이 이미지는 건너뛰고 나머지 이미지로 계속 진행한다.
  }
}

/**
 * 후보 이미지 URL 목록을 동시에(병렬로) 내려받는다.
 * 하나가 실패해도(타임아웃, 404, 용량 초과, SSRF 차단 등) 나머지로 계속 진행하고
 * 성공한 로컬 파일 경로만 반환한다 - 전체 작업이 이미지 하나 때문에 느려지거나 실패하지 않게 한다.
 */
export async function downloadImages(urls, destDir, { max = config.maxImages, onEach } = {}) {
  await fs.mkdir(destDir, { recursive: true });
  const targets = urls.slice(0, max); // 순차 재시도가 없으니 후보를 과하게 늘릴 필요가 없다

  let done = 0;
  const paths = await Promise.all(
    targets.map(async (url, i) => {
      const result = await downloadOne(url, destDir, i);
      done += 1;
      onEach?.(done, targets.length);
      return result;
    })
  );
  return paths.filter(Boolean);
}
