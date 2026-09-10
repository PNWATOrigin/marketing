import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { safeFetch } from './safeHttp.js';

const exec = promisify(execFile);

// HTML의 width/height 속성은 없거나(지연 로딩) 부정확한 경우가 많아, 실제로 내려받은
// 이미지 파일을 열어 픽셀 크기를 확인한다. 너무 작거나(아이콘/구분선) 가로로 긴 극단적인
// 비율(얇은 배너/구분선)은 상품 사진이 아닐 가능성이 커서 제외한다. 반대로 세로로 아주 긴
// 이미지는 "상세페이지" 전체를 이어붙인 이미지인 경우가 많아 - 버리지 않고 여러 장으로
// 잘라서(slice) 각각을 후보 이미지로 쓴다.
async function analyzeImage(filePath) {
  try {
    const { stdout } = await exec(
      config.ffprobePath,
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', filePath],
      { timeout: 4000 }
    );
    const [w, h] = stdout.trim().split('x').map(Number);
    if (!w || !h) return { verdict: 'reject' };
    if (w < 300 || h < 300) return { verdict: 'reject' };
    if (Math.max(w, h) / Math.min(w, h) > 4) {
      if (h > w) return { verdict: 'slice', w, h };
      return { verdict: 'reject' }; // 가로로 긴 얇은 배너/구분선
    }
    return { verdict: 'keep' };
  } catch {
    return { verdict: 'keep' }; // 분석에 실패하면(포맷 미지원 등) 기존처럼 통과시켜 렌더링 자체는 막지 않는다.
  }
}

// 사진이 아니라 글자/로고 위주의 배너인지 판별한다. 실제 상품·모델 사진은 배경이
// 단순해도 피사체 때문에 색이 다양한 반면, 글자/로고 이미지는 배경색+글자색 등
// 소수의 색만으로 픽셀 대부분을 채운다 - 아주 작게 축소한 뒤 색 분포를 보고 판별한다.
async function isPhotographic(filePath) {
  try {
    const { stdout } = await exec(
      config.ffmpegPath,
      ['-v', 'error', '-i', filePath, '-vf', 'scale=48:48', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { timeout: 5000, encoding: 'buffer', maxBuffer: 1024 * 1024 }
    );
    const pixels = stdout;
    const total = pixels.length / 3;
    if (!total) return true;
    const counts = new Map();
    for (let i = 0; i < pixels.length; i += 3) {
      // 4bit/채널로 양자화해서 안티에일리어싱으로 인한 미세한 색 차이를 뭉친다.
      const key = ((pixels[i] >> 4) << 8) | ((pixels[i + 1] >> 4) << 4) | (pixels[i + 2] >> 4);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = [...counts.values()].sort((a, b) => b - a);
    let covered = 0;
    let colorsFor90 = 0;
    for (const c of sorted) {
      covered += c;
      colorsFor90 += 1;
      if (covered / total >= 0.9) break;
    }
    return colorsFor90 > 4; // 4가지 이하 색으로 90% 이상 채워지면 글자/로고 배너로 판단
  } catch {
    return true; // 분석에 실패하면 기존처럼 통과시켜 렌더링 자체는 막지 않는다.
  }
}

// 세로로 아주 긴 "상세페이지" 이미지를 균등한 여러 조각으로 잘라 각각을 독립된 이미지
// 파일로 저장한다. 조각 하나 실패해도 나머지 조각으로 계속 진행한다.
async function sliceTallImage(filePath, destDir, index, w, h) {
  const idealSliceHeight = Math.round(w * 1.6); // 세로로 긴 장면(9:16)에 가까운 비율
  const numSlices = Math.min(4, Math.max(2, Math.round(h / idealSliceHeight)));
  const sliceHeight = Math.floor(h / numSlices);
  const ext = path.extname(filePath);

  const outputs = [];
  for (let i = 0; i < numSlices; i += 1) {
    const y = i * sliceHeight;
    const outPath = path.join(destDir, `img_${index}_slice${i}${ext}`);
    try {
      await exec(
        config.ffmpegPath,
        ['-y', '-i', filePath, '-vf', `crop=${w}:${sliceHeight}:0:${y}`, '-frames:v', '1', outPath],
        { timeout: 6000 }
      );
      outputs.push(outPath);
    } catch {
      // 이 조각만 건너뛰고 나머지 조각으로 계속 진행한다.
    }
  }
  return outputs;
}

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

// 반환값은 배열이다: 이미지 하나가 그대로 채택되면 원소 1개, "상세페이지"처럼 세로로
// 아주 긴 이미지라 여러 조각으로 잘리면 원소 여러 개, 제외되면 빈 배열이 된다.
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
    if (!res || res.status >= 400) return [];
    const contentType = (res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = EXT_BY_MIME[contentType];
    if (!ext) return []; // 이미지가 아닌 응답은 건너뛴다
    if (!res.body || res.body.length < 200) return []; // 지나치게 작은(깨진) 이미지는 제외

    const filePath = path.join(destDir, `img_${index}${ext}`);
    await fs.writeFile(filePath, res.body);

    const info = await analyzeImage(filePath);
    if (info.verdict === 'reject') {
      await fs.rm(filePath, { force: true });
      return [];
    }
    if (info.verdict === 'slice') {
      const slices = await sliceTallImage(filePath, destDir, index, info.w, info.h);
      await fs.rm(filePath, { force: true });
      const photoSlices = [];
      for (const slicePath of slices) {
        if (await isPhotographic(slicePath)) photoSlices.push(slicePath);
        else await fs.rm(slicePath, { force: true });
      }
      return photoSlices;
    }
    if (!(await isPhotographic(filePath))) {
      await fs.rm(filePath, { force: true });
      return [];
    }
    return [filePath];
  } catch {
    return []; // 이 이미지는 건너뛰고 나머지 이미지로 계속 진행한다.
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
  const results = await Promise.all(
    targets.map(async (url, i) => {
      const result = await downloadOne(url, destDir, i);
      done += 1;
      onEach?.(done, targets.length);
      return result;
    })
  );
  return results.flat();
}
