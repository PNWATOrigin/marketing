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
export async function downloadImages(urls, destDir, { max = config.maxImages } = {}) {
  await fs.mkdir(destDir, { recursive: true });
  const results = [];
  const targets = urls.slice(0, max * 2); // 실패를 감안해 후보를 넉넉히 시도

  for (const url of targets) {
    if (results.length >= max) break;
    try {
      const res = await safeFetch(url, {
        timeoutMs: config.imageTimeoutMs,
        maxBytes: config.maxImageBytes,
        accept: 'image/*',
      });
      if (res.status >= 400) continue;
      const contentType = (res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = EXT_BY_MIME[contentType];
      if (!ext) continue; // 이미지가 아닌 응답은 건너뛴다
      if (!res.body || res.body.length < 200) continue; // 지나치게 작은(깨진) 이미지는 제외

      const filePath = path.join(destDir, `img_${results.length}${ext}`);
      await fs.writeFile(filePath, res.body);
      results.push(filePath);
    } catch {
      // 이 이미지는 건너뛰고 나머지 이미지로 계속 진행한다.
    }
  }
  return results;
}
