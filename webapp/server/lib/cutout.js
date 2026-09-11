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

// Only a few sequential candidates: keep memory bounded on the free server.
export async function addDetailStickers(assets, workDir) {
  const path = await import('node:path');
  let accepted=0;
  for (const asset of assets.filter(a=>!a.animated && !['TEXT_IMAGE','LOGO','UNUSABLE'].includes(a.type)).slice(0,3)) {
    const stickerPath=path.join(workDir,`sticker-${accepted}.png`);
    const composition=path.join(workDir,`sticker-scene-${accepted}.jpg`);
    try {
      await exec(process.env.PYTHON_PATH||'python3',[fileURLToPath(new URL('./detailSticker.py',import.meta.url)),asset.path,stickerPath,composition],{timeout:45000,windowsHide:true,env:{...process.env,OMP_NUM_THREADS:'1'}});
      // Preserve source OCR tags so the sticker is selected for the same subject.
      Object.assign(asset,{path:composition,stickerPath,originalPath:asset.path,width:1080,height:1920,composition:1080/1920,provenance:asset.provenance+'+photo-region+cutout'});
      accepted++;
    } catch { /* Failed quality checks retain the original image. */ }
  }
  return assets;
}
