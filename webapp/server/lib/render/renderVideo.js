import { config } from '../../config.js';
import { resolveFonts } from './fonts.js';
import { ensureGradientBackground } from './gradient.js';
import { buildRenderPlan, RENDER_CONSTANTS } from './filterGraph.js';
import { runFfmpeg, runFfprobe, FfmpegError } from './ffmpegRunner.js';

function pickSceneImages(scenes, imagePaths, gradientPath) {
  if (!imagePaths.length) return scenes.map(() => gradientPath);
  return scenes.map((_, i) => imagePaths[i % imagePaths.length]);
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
export async function renderVideo({ scenes, imagePaths, outputPath, onProgress }) {
  const fonts = resolveFonts();
  const gradientPath = await ensureGradientBackground();
  const sceneImagePaths = pickSceneImages(scenes, imagePaths, gradientPath);

  const plan = buildRenderPlan({ scenes, sceneImagePaths, fonts });

  onProgress?.('rendering');

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...plan.inputArgs,
    '-filter_complex',
    plan.filterComplex,
    '-map',
    plan.outputLabel,
    '-r',
    String(plan.fps),
    '-t',
    plan.totalDuration.toFixed(2),
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];

  await runFfmpeg(args, { timeoutMs: config.renderTimeoutMs });
  const info = await verifyOutput(outputPath, plan.totalDuration);
  return { outputPath, ...info, totalDuration: plan.totalDuration };
}
