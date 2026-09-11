import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { config } from '../config.js';

// OCR을 provider로 분리해서 나중에 외부 Vision OCR을 붙이더라도 호출 쪽
// (jobManager.js)은 바꿀 필요가 없게 한다. 기본은 무료 로컬 OCR이고,
// 외부 provider가 설정되지 않았거나 호출에 실패하면 항상 로컬로 되돌아간다
// (최선 노력, 상품 분석 전체를 막지 않고 비용도 발생시키지 않는다).

// 무료 로컬 OCR(Tesseract). 실패/타임아웃이면 빈 문자열을 반환한다.
async function localOcr(imagePath, timeoutMs) {
  const scaled=imagePath+'.ocr.png';
  try {
    await promisify(execFile)(config.ffmpegPath,['-y','-threads','1','-i',imagePath,'-vf','scale=800:-1','-threads','1','-frames:v','1',scaled],{timeout:12000});
    imagePath=scaled;
  } catch {}
  try {
  return await new Promise((resolve) => {
    execFile(
      'tesseract',
      [imagePath, 'stdout', '-l', 'kor+eng', '--psm', '6'],
      { timeout: Math.max(timeoutMs,15000), env:{...process.env,OMP_THREAD_LIMIT:'1'}, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? '' : stdout)
    );
  });
  } finally { await fs.rm(scaled,{force:true}).catch(()=>{}); }
}

// 외부 Vision OCR을 붙이고 싶다면 여기에 실제 API 호출을 구현하면 된다. 지금은
// API 키가 설정되지 않았으므로 항상 null(사용 불가)을 반환해 로컬로 위임한다.
async function visionOcr(/* imagePath, timeoutMs */) {
  if (!config.ocrVisionApiKey) return null;
  return null; // TODO: 실제 Vision OCR 연동 시 이 자리에 API 호출을 구현한다.
}

const PROVIDERS = { local: localOcr, vision: visionOcr };

export async function ocrImage(imagePath, timeoutMs) {
  const provider = PROVIDERS[config.ocrProvider] || localOcr;
  if (provider !== localOcr) {
    try {
      const text = await provider(imagePath, timeoutMs);
      if (text) return text;
    } catch {
      // 외부 provider 실패는 무시하고 로컬로 이어간다.
    }
  }
  return localOcr(imagePath, timeoutMs);
}
