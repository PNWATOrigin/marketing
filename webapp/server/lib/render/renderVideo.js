import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { resolveFonts } from './fonts.js';
import { buildRenderPlan, buildNarrationPlan, RENDER_CONSTANTS } from './filterGraph.js';
import { runFfmpeg, runFfprobe, FfmpegError } from './ffmpegRunner.js';

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
  if (Number.isFinite(duration) && Math.abs(duration - expectedDuration) > 1.0) {
    throw new FfmpegError(`영상 길이가 예상과 달라요. (${duration}s)`);
  }
  return { width, height, duration, codec };
}

/**
 * 대본(scenes)과 다운로드된 이미지들로 최종 9:16 세로형 MP4를 렌더링한다.
 * 이미지가 부족하면(0장 포함) 민트→화이트 그라데이션 배경으로 대체해서
 * 이미지 문제만으로 전체 렌더링이 실패하지 않게 한다.
 */
export async function renderVideo({ scenes, imagePaths, outputPath, onProgress, purpose, narration, style }) {
  const fonts = resolveFonts();
  const gradientPath = null;
  const sceneImagePaths = pickSceneImages(scenes, imagePaths, gradientPath);

  const textDir = await fs.mkdtemp(path.join(path.dirname(outputPath), 'captions-'));
  const prepared = await Promise.all(scenes.map(async (scene, i) => {
    const textFiles = { headline: path.join(textDir, `${i}-head.txt`), sub: path.join(textDir, `${i}-sub.txt`) };
    await fs.writeFile(textFiles.headline, String(scene.headline || ''), 'utf8');
    await fs.writeFile(textFiles.sub, String(scene.sub || ''), 'utf8');
    const captionFiles=[];
    if(narration) {
      let group=[];
      const flush=async()=>{
        if(!group.length)return;
        const text=group.map(c=>c.text).join(' ');
        const lines=text.match(/.{1,18}(?:\s|$)|.{1,18}/gu)||[text];
        const file=path.join(textDir,`${i}-cue-${captionFiles.length}.txt`);
        await fs.writeFile(file,lines.join('\n'),'utf8');
        captionFiles.push({path:file,start:Math.max(0,group[0].start-scene.start),end:Math.min(scene.duration,group.at(-1).end-scene.start)});
        group=[];
      };
      for(const c of scene.cues){if(group.length&&(group.map(w=>w.text).join(' ').length+c.text.length>32||c.start-group[0].start>1.3))await flush();group.push(c);}
      await flush();
    }
    return { ...scene, textFiles, captionFiles };
  }));
  const plan = narration ? buildNarrationPlan({scenes:prepared,fonts,style}) : buildRenderPlan({ scenes: prepared, sceneImagePaths, fonts });

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...plan.inputArgs,
    ...(narration?['-protocol_whitelist','file,pipe','-f',narration.format,'-i',narration.path]:['-i',pickBgm(purpose)]),
    '-filter_complex_threads', '1',
    '-filter_complex',
    plan.filterComplex,
    '-map',
    plan.outputLabel,
    '-r',
    String(plan.fps),
    '-t',
    (Math.ceil(plan.totalDuration*30)/30).toFixed(4),
    '-map', `${sceneImagePaths.length}:a`,
    // 배경음악이 영상 길이에 맞춰 자연스럽게 끝나도록 페이드아웃하고, 자막이 잘 들리도록 볼륨을 낮춘다.
    ...(narration?[]:['-af', `volume=0.55,afade=t=out:st=${Math.max(0, plan.totalDuration - 0.4).toFixed(2)}:d=0.4`]),
    '-c:a', 'aac', '-b:a', narration?'192k':'96k',
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
  } finally {
    await fs.rm(textDir, { recursive: true, force: true });
  }
  const info = await verifyOutput(outputPath, plan.totalDuration);
  if(narration){
    const probe=JSON.parse(await runFfprobe(['-v','error','-select_streams','a:0','-show_entries','stream=duration','-of','json',outputPath]));
    if(!probe.streams?.[0]||Math.abs(Number(probe.streams[0].duration)-narration.duration)>0.12)throw new FfmpegError('원본 음성 길이 검증에 실패했어요.');
  }
  return { outputPath, ...info, totalDuration: plan.totalDuration };
}
