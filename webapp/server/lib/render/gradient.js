import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../../config.js';

const ASSETS_DIR = path.join(config.dataDir, 'assets');
const GRADIENT_PATH = path.join(ASSETS_DIR, 'gradient-bg.png');

// 디자인 레퍼런스: 밝은 민트에서 화이트로 이어지는 부드러운 그라데이션 배경.
const MINT = '0x6EE7B7';
const WHITE = '0xFFFFFF';

/**
 * 상품 이미지를 하나도 구하지 못했을 때 쓸 기본 배경(민트→화이트 그라데이션)을 준비한다.
 * 한 번만 생성해서 캐시하고, 이후 작업들은 재사용한다.
 */
export async function ensureGradientBackground() {
  if (fssync.existsSync(GRADIENT_PATH)) return GRADIENT_PATH;
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `gradients=size=1080x1920:c0=${MINT}:c1=${WHITE}:x0=540:y0=0:x1=540:y1=1920`,
      '-frames:v',
      '1',
      GRADIENT_PATH,
    ];
    const proc = spawn(config.ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`그라데이션 배경 생성 실패: ${stderr}`))));
  });
  return GRADIENT_PATH;
}
