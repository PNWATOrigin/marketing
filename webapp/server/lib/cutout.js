import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const exec = promisify(execFile);

// rembg(무료 로컬 배경제거 모델)로 상세 이미지를 "누끼"딴 뒤, 브랜드 그라데이션 배경 위에
// 합성해서 기존 Ken Burns 렌더 파이프라인에 그대로 넣을 수 있는 완성된 이미지를 만든다.
// 어느 단계든 실패하면 null을 반환하고, 호출 쪽은 원본 이미지를 그대로 쓰면 된다.
export async function cutoutOnBackground(inputPath, outputPath, backgroundPath, timeoutMs = config.cutoutTimeoutMs) {
  const cutoutPath = `${outputPath}.cutout.png`;
  try {
    await exec(
      process.env.PYTHON_PATH || 'python3',
      [fileURLToPath(new URL('./rembgCutout.py', import.meta.url)), inputPath, cutoutPath],
      { timeout: timeoutMs, windowsHide: true }
    );
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', backgroundPath,
      '-i', cutoutPath,
      '-filter_complex', '[1:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2:format=auto',
      '-frames:v', '1', outputPath,
    ];
    const proc = spawn(config.ffmpegPath, args);
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => resolve(code === 0 ? outputPath : null));
  });
}
