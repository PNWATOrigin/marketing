import fssync from 'node:fs';

const BOLD_CANDIDATES = [
  process.env.FONT_BOLD_PATH,
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJKkr-Bold.otf',
  '/System/Library/Fonts/Supplemental/AppleSDGothicNeo.ttc',
].filter(Boolean);

const REGULAR_CANDIDATES = [
  process.env.FONT_REGULAR_PATH,
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf',
  '/System/Library/Fonts/Supplemental/AppleSDGothicNeo.ttc',
].filter(Boolean);

function firstExisting(candidates) {
  return candidates.find((p) => {
    try {
      return fssync.existsSync(p);
    } catch {
      return false;
    }
  });
}

let cached = null;

/**
 * 한글이 포함된 자막을 그리는 데 필요한 폰트 파일을 찾는다.
 * 없으면 서버 시작 시점에 바로 에러를 던져서 렌더링 중간에 실패하지 않게 한다.
 */
export function resolveFonts() {
  if (cached) return cached;
  const bold = firstExisting(BOLD_CANDIDATES);
  const regular = firstExisting(REGULAR_CANDIDATES) || bold;
  if (!bold && !regular) {
    throw new Error(
      '한글 폰트를 찾을 수 없어요. Noto Sans CJK 폰트를 설치해주세요. (예: apt-get install -y fonts-noto-cjk) ' +
        '또는 FONT_BOLD_PATH / FONT_REGULAR_PATH 환경변수로 폰트 경로를 지정하세요.'
    );
  }
  cached = { bold: bold || regular, regular: regular || bold };
  return cached;
}
