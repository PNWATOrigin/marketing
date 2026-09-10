import { execFile } from 'node:child_process';

// Tesseract OCR로 이미지 속 텍스트를 읽는다(무료, 로컬). 실패/타임아웃이면 빈 문자열을
// 반환해서 호출 쪽이 그냥 건너뛸 수 있게 한다(최선 노력, 상품 분석 전체를 막지 않음).
export function ocrImage(imagePath, timeoutMs) {
  return new Promise((resolve) => {
    execFile(
      'tesseract',
      [imagePath, 'stdout', '-l', 'kor+eng', '--psm', '6'],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? '' : stdout)
    );
  });
}

// OCR 결과는 줄바꿈이 뒤섞이고 잡음이 많으므로, 짧고 한글/영문 위주로만 이뤄진
// "특징처럼 보이는" 줄만 골라 쓴다. 애매한 줄은 버려서 잘못된 정보를 지어내지 않는다.
const CLEAN_LINE = /^[가-힣a-zA-Z0-9 &,.!?%-]{2,20}$/;

export function extractCleanLines(text, max = 3) {
  const seen = new Set();
  const lines = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!CLEAN_LINE.test(line)) continue;
    const hasKorean = /[가-힣]/.test(line);
    if (!hasKorean && !/^[a-zA-Z0-9 &,.!?%-]{4,}$/.test(line)) continue; // 한글 없는 짧은 잡음 제거
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= max) break;
  }
  return lines;
}
