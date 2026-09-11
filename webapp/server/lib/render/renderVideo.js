import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { resolveFonts } from './fonts.js';
import { buildRenderPlan, buildNarrationPlan, RENDER_CONSTANTS } from './filterGraph.js';
import { runFfmpeg, runFfprobe, FfmpegError } from './ffmpegRunner.js';
import { boingTrack, exportSources } from './editSources.js';

// 글자 수로만 잘라 줄바꿈하면 단어 중간이 끊겨 읽기 불편하므로, 띄어쓰기(어절) 단위로
// 줄바꿈한다. 내용이 잘리지 않도록 줄 수는 제한하지 않는다(자막 영역이 좁아 보통
// 1~2줄에서 끝난다 - script.js가 애초에 문구 길이를 짧게 만들어둔다).
function wrapCaption(text, maxCharsPerLine = 20) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && [...next].length > maxCharsPerLine) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

function pickSceneImages(scenes, imagePaths, gradientPath) {
  if (!imagePaths.length) throw new FfmpegError('상품 이미지를 가져오지 못했어요. 다른 상품 URL로 다시 시도해주세요.');
  return scenes.map((_, i) => imagePaths[i % imagePaths.length]);
}

// 목적(조회수/판매전환/브랜드인지도)마다 분위기가 다른 배경음악을 미리 만들어두고 골라 쓴다.
// 매번 새로 생성하지 않아 빠르고, 외부 API 비용도 들지 않는다.
const BGM_BY_PURPOSE = { views: 'views.mp3', sales: 'sales.mp3', brand: 'brand.mp3' };
function pickBgm(purpose) {
  return path.join(config.rootDir, 'assets', 'bgm', BGM_BY_PURPOSE[purpose] || 'sales.mp3');
}

async function verifyOutput(outputPath, expectedDuration) {
  const stdout = await runFfprobe([
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,duration,codec_name',
    '-of',
    'json',
    outputPath,
  ]);
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0];
  if (!stream) throw new FfmpegError('생성된 영상 정보를 확인할 수 없어요.');
  const { width, height, codec_name: codec } = stream;
  if (width !== RENDER_CONSTANTS.WIDTH || height !== RENDER_CONSTANTS.HEIGHT) {
    throw new FfmpegError(`영상 해상도가 올바르지 않아요. (${width}x${height})`);
  }
  if (codec !== 'h264') {
    throw new FfmpegError(`영상 코덱이 올바르지 않아요. (${codec})`);
  }
  const duration = parseFloat(stream.duration);
  if (!Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 0.12) {
    throw new FfmpegError(`영상 길이가 예상과 달라요. (${duration}s)`);
  }
  return { width, height, duration, codec };
}

/**
 * 대본(scenes)과 다운로드된 이미지들로 최종 9:16 세로형 MP4를 렌더링한다.
 * 이미지가 부족하면(0장 포함) 민트→화이트 그라데이션 배경으로 대체해서
 * 이미지 문제만으로 전체 렌더링이 실패하지 않게 한다.
 */
export async function renderVideo({ scenes, imagePaths, outputPath, onProgress, purpose, style }) {
  const fonts = resolveFonts();
  const gradientPath = null;
  const sceneImagePaths = pickSceneImages(scenes, imagePaths, gradientPath);

  const textDir = await fs.mkdtemp(path.join(path.dirname(outputPath), 'captions-'));
  const prepared = await Promise.all(scenes.map(async (scene, i) => {
    const headline = wrapCaption(scene.headline);
    const sub = wrapCaption(scene.sub);
    const textFiles = { headline: path.join(textDir, `${i}-head.txt`), sub: path.join(textDir, `${i}-sub.txt`) };
    await fs.writeFile(textFiles.headline, headline, 'utf8');
    await fs.writeFile(textFiles.sub, sub, 'utf8');
    scene = { ...scene, headline, sub };
    const captionFiles=[];
    if(style) {
      let group=[];
      const flush=async()=>{
        if(!group.length)return;
        const text=group.map(c=>c.text).join(' ');
        const lines=wrapCaption(text,18).split('\n');
        const file=path.join(textDir,`${i}-cue-${captionFiles.length}.txt`);
        await fs.writeFile(file,lines.join('\n'),'utf8');
        captionFiles.push({path:file,text:lines.join('\n'),start:Math.max(0,group[0].start-scene.start),end:Math.min(scene.duration,group.at(-1).end-scene.start)});
        group=[];
      };
      for(const c of scene.cues){if(group.length&&(group.map(w=>w.text).join(' ').length+c.text.length>32||c.start-group[0].start>1.3))await flush();group.push(c);}
      await flush();
    }
    return { ...scene, textFiles, captionFiles };
  }));
  const plan = style ? buildNarrationPlan({scenes:prepared,fonts,style}) : buildRenderPlan({ scenes: prepared, sceneImagePaths, fonts });
  const cues=prepared.flatMap(s=>style?s.captionFiles.map(c=>({start:s.start+c.start,end:s.start+c.end,text:c.text})):[{start:s.start,end:s.end,text:[s.headline,s.sub].filter(Boolean).join('\n')}]).filter(c=>c.text);
  const effects=path.join(textDir,'boing.wav');
  await fs.writeFile(effects,boingTrack(plan.totalDuration,cues.map(c=>c.start)));
  const audioIndex=scenes.length;
  const audioFilter=`;[${audioIndex}:a]volume=0.35,afade=t=in:d=0.2,afade=t=out:st=${Math.max(0,plan.totalDuration-0.4)}:d=0.4[bgm];[bgm][${audioIndex+1}:a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=0[aout]`;

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...plan.inputArgs,
    '-stream_loop','-1','-i',pickBgm(purpose),
    '-i',effects,
    '-filter_complex_threads', '1',
    '-filter_complex',
    plan.filterComplex+audioFilter,
    '-map',
    plan.outputLabel,
    '-r',
    String(plan.fps),
    '-t',
    (Math.ceil(plan.totalDuration*30)/30).toFixed(4),
    '-map', '[aout]',
    // 배경음악이 영상 길이에 맞춰 자연스럽게 끝나도록 페이드아웃하고, 자막이 잘 들리도록 볼륨을 낮춘다.
    '-c:a', 'aac', '-b:a', '128k',
    '-c:v',
    'libx264',
    '-threads', '2',
    '-preset',
    'ultrafast', // 3분 이내 완료 목표: 압축률보다 인코딩 속도 우선 (짧은 SNS 영상이라 화질 차이는 미미함)
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];

  // onProgress(fraction)로 0~1 사이 실제 ffmpeg 진행률을 그대로 전달한다.
  try {
    await runFfmpeg(args, { timeoutMs: config.renderTimeoutMs, totalSeconds: plan.totalDuration, onProgress });
    await exportSources({outputPath,scenes:prepared.map((s,i)=>({...s,imagePath:style?s.imagePath:sceneImagePaths[i]})),cues,bgm:pickBgm(purpose),effects});
  } finally {
    await fs.rm(textDir, { recursive: true, force: true });
  }
  const info = await verifyOutput(outputPath, plan.totalDuration);
  return { outputPath, ...info, totalDuration: plan.totalDuration };
}
