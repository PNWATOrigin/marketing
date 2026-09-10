const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

// 화면 가장자리를 피해 자막을 배치하기 위한 안전영역 여백.
const SAFE_MARGIN_X = 96;
const HEADLINE_Y = Math.round(HEIGHT * 0.56);

const COLOR = {
  darkGreen: '0x0B3D2E',
  white: '0xFFFFFF',
  mint: '0x34D399',
  emerald: '0x059669',
};

function escText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '’');
}

function headlineFontSize(text) {
  const len = [...text].length;
  if (len <= 6) return 104;
  if (len <= 10) return 86;
  if (len <= 16) return 66;
  if (len <= 24) return 52;
  return 42;
}

function subFontSize(text) {
  const len = [...text].length;
  if (len <= 14) return 50;
  if (len <= 22) return 42;
  return 34;
}

// 장면 시작 후 살짝 늦게 팝업되고, 장면이 끝나기 직전 자연스럽게 사라지는 알파값 표현식.
function popAlphaExpr(delay, duration) {
  const popIn = 0.18;
  const fadeOut = 0.15;
  const fadeStart = Math.max(delay + popIn, duration - fadeOut);
  return (
    `if(lt(t,${delay}),0,` +
    `if(lt(t,${delay + popIn}),(t-${delay})/${popIn},` +
    `if(lt(t,${fadeStart}),1,` +
    `max(0,(${duration}-t)/${fadeOut}))))`
  );
}

function drawText({
  text,
  fontPath,
  fontSize,
  y,
  color = COLOR.darkGreen,
  delay,
  duration,
  box = true,
  boxColor = '0xFFFFFF@0.6',
  borderColor,
  borderWidth = 0,
}) {
  const alpha = popAlphaExpr(delay, duration);
  const parts = [
    `fontfile='${fontPath}'`,
    `text='${escText(text)}'`,
    `fontsize=${fontSize}`,
    `fontcolor=${color}`,
    `x=(w-text_w)/2`,
    `y=${y}`,
    `alpha='${alpha}'`,
    `line_spacing=6`,
  ];
  if (box) {
    parts.push('box=1', `boxcolor=${boxColor}`, 'boxborderw=22');
  }
  if (borderColor && borderWidth > 0) {
    parts.push(`borderw=${borderWidth}`, `bordercolor=${borderColor}`);
  }
  return `drawtext=${parts.join(':')}`;
}

// Ken Burns(줌인/줌아웃/패닝) 패턴을 장면마다 번갈아 적용해 리듬감을 준다.
function kenBurnsFilter(index) {
  const patterns = [
    { zoomIn: true, fx: 0.5, fy: 0.5 },
    { zoomIn: false, fx: 0.5, fy: 0.5 },
    { zoomIn: true, fx: 0.22, fy: 0.35 },
    { zoomIn: true, fx: 0.78, fy: 0.6 },
  ];
  const p = patterns[index % patterns.length];
  const z = p.zoomIn ? 'min(zoom+0.0016,1.2)' : "if(eq(on,0),1.2,max(zoom-0.0016,1.0))";
  const x = `(iw-iw/zoom)*${p.fx}`;
  const y = `(ih-ih/zoom)*${p.fy}`;
  return { z, x, y };
}

function buildSceneFilter(scene, index, fonts) {
  const duration = Math.max(0.1, scene.duration);
  const frames = Math.max(1, Math.round(duration * FPS));
  const kb = kenBurnsFilter(index);

  const chain = [
    `[${index}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
    `zoompan=z='${kb.z}':d=${frames}:x='${kb.x}':y='${kb.y}':s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    'setsar=1',
    'format=yuv420p',
  ];

  const layers = [];
  let cursor = 0.05;
  if (scene.badge) {
    layers.push(
      drawText({
        text: scene.badge,
        fontPath: fonts.bold,
        fontSize: 40,
        y: HEADLINE_Y - 190,
        color: COLOR.white,
        boxColor: `${COLOR.emerald}@0.85`,
        delay: cursor,
        duration,
      })
    );
    cursor += 0.1;
  }

  // 숏폼 감성의 "네온 팝업 자막" 스타일: 배경 박스 대신 굵은 컬러 테두리로 강조한다.
  layers.push(
    drawText({
      text: scene.headline,
      fontPath: fonts.bold,
      fontSize: headlineFontSize(scene.headline),
      y: HEADLINE_Y,
      color: COLOR.white,
      box: false,
      borderColor: COLOR.emerald,
      borderWidth: 14,
      delay: cursor,
      duration,
    })
  );
  cursor += 0.12;

  let nextY = HEADLINE_Y + 120;
  if (scene.emphasis) {
    layers.push(
      drawText({
        text: scene.emphasis,
        fontPath: fonts.bold,
        fontSize: 46,
        y: nextY,
        color: COLOR.white,
        boxColor: `${COLOR.mint}@0.92`,
        delay: cursor,
        duration,
      })
    );
    cursor += 0.1;
    nextY += 110;
  }

  if (scene.sub) {
    layers.push(
      drawText({
        text: scene.sub,
        fontPath: fonts.bold,
        fontSize: subFontSize(scene.sub),
        y: nextY,
        color: COLOR.white,
        box: false,
        borderColor: COLOR.darkGreen,
        borderWidth: 8,
        delay: cursor,
        duration,
      })
    );
  }

  const filter = [...chain, ...layers].join(',');
  return `${filter}[v${index}]`;
}

/**
 * scenes와 각 장면에 쓸 이미지 경로를 받아 ffmpeg 입력 인자와 filter_complex를 만든다.
 * 순수 함수라서 실제 ffmpeg 실행 없이 필터 그래프만 검증(테스트)할 수 있다.
 */
export function buildRenderPlan({ scenes, sceneImagePaths, fonts, marginXUnused = SAFE_MARGIN_X }) {
  if (scenes.length !== sceneImagePaths.length) {
    throw new Error('장면 수와 이미지 수가 일치하지 않습니다.');
  }
  // 주의: 여기서 "-loop 1"을 쓰면 입력이 끝나지 않는 무한 스트림이 되어,
  // zoompan이 절대 EOF를 내지 않고 뒤따르는 concat이 이 장면에서 멈춰버린다.
  // 이미지를 단일 프레임으로만 넣고, zoompan의 d(프레임 수)가 스스로 장면 길이를 만들게 한다.
  const inputArgs = [];
  sceneImagePaths.forEach((imgPath) => {
    inputArgs.push('-i', imgPath);
  });

  const sceneFilters = scenes.map((scene, i) => buildSceneFilter(scene, i, fonts));
  const concatInputs = scenes.map((_, i) => `[v${i}]`).join('');
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const fadeOutStart = Math.max(0, totalDuration - 0.4);

  const filterComplex =
    `${sceneFilters.join(';')};` +
    `${concatInputs}concat=n=${scenes.length}:v=1:a=0[vcat];` +
    `[vcat]fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.4[vout]`;

  return { inputArgs, filterComplex, outputLabel: '[vout]', totalDuration, width: WIDTH, height: HEIGHT, fps: FPS };
}

export const RENDER_CONSTANTS = { WIDTH, HEIGHT, FPS };
