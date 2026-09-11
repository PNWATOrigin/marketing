import { hasBannedClaim } from './claimsGuard.js';

// 실제 OCR 실행은 교체 가능한 provider(ocrProviders.js)에 위임한다 - 기본은 무료
// 로컬 OCR(Tesseract)이고, 필요하면 외부 Vision OCR로 바꿀 수 있다. 이 함수의
// 사용처(jobManager.js, storyboard.js)는 provider가 바뀌어도 그대로 쓸 수 있다.
export { ocrImage } from './ocrProviders.js';

// OCR 결과는 줄바꿈이 뒤섞이고 잡음이 많으므로, 짧고 한글/영문 위주로만 이뤄진
// "특징처럼 보이는" 줄만 골라 쓴다. 애매한 줄은 버려서 잘못된 정보를 지어내지 않는다.
const CLEAN_LINE = /^[가-힣a-zA-Z0-9 &,.!?%-]{2,20}$/;

// 반환값의 blockedCount는 "완치"/"100% 효과"처럼 검증되지 않은 과장 표현이 포함돼
// 제외한 줄의 개수다. 호출 쪽은 이 값으로 사용자에게 검수 경고를 남길 수 있다.
//
// 여러 이미지의 OCR 결과를 이어붙여 한 번에 처리하다 보니, 사진 속 잡음이 우연히
// 글자처럼 인식된 줄이 먼저 나와 뒤에 나오는 진짜 배너 이미지의 문구(가격/용량/할인율
// 등 숫자가 포함된 문구)를 밀어낼 수 있다. 이를 막기 위해 후보를 먼저 모두 모은 뒤,
// 숫자가 포함된 줄(상품명·가격·용량·수량·기간·성분 함량 등일 가능성이 높음)을
// 우선 채택하고 나서야 나머지로 채운다.
export function extractCleanLines(text, max = 3) {
  const seen = new Set();
  const candidates = [];
  let blockedCount = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!CLEAN_LINE.test(line)) continue;
    const hasKorean = /[가-힣]/.test(line);
    if (!hasKorean && !/^[a-zA-Z0-9 &,.!?%-]{4,}$/.test(line)) continue; // 한글 없는 짧은 잡음 제거
    if (seen.has(line)) continue;
    if (hasBannedClaim(line)) {
      blockedCount += 1;
      continue;
    }
    seen.add(line);
    candidates.push(line);
    if (candidates.length >= max * 5) break; // 잡음까지 무한정 모으지 않도록 여유 있게만 제한
  }
  const withNumber = candidates.filter((l) => /\d/.test(l));
  const withoutNumber = candidates.filter((l) => !/\d/.test(l));
  const lines = [...withNumber, ...withoutNumber].slice(0, max);
  return { lines, blockedCount };
}
