import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function int(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int('PORT', 3000),
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',

  maxRenderConcurrency: int('MAX_RENDER_CONCURRENCY', 1),
  maxAnalyzeConcurrency: int('MAX_ANALYZE_CONCURRENCY', 4),
  maxActiveJobsPerClient: int('MAX_ACTIVE_JOBS_PER_CLIENT', 1),

  outputExpiryMinutes: int('OUTPUT_EXPIRY_MINUTES', 30),
  cleanupIntervalMinutes: int('CLEANUP_INTERVAL_MINUTES', 5),

  analyzeTimeoutMs: int('ANALYZE_TIMEOUT_MS', 12000),
  imageTimeoutMs: int('IMAGE_TIMEOUT_MS', 6000),
  // 목적 선택 후 "제작 시작"부터 완성까지 총 3분 안에 끝나도록: 이미지 준비(최대 ~9초) +
  // 인코딩(최대 150초) + 여유분을 더해도 3분 밑으로 떨어지게 잡은 값.
  renderTimeoutMs: int('RENDER_TIMEOUT_MS', 150000),

  maxHtmlBytes: int('MAX_HTML_BYTES', 3 * 1024 * 1024),
  maxImageBytes: int('MAX_IMAGE_BYTES', 8 * 1024 * 1024),
  maxImages: int('MAX_IMAGES', 6),

  maxRenderAttempts: int('MAX_RENDER_ATTEMPTS', 2),

  // 로컬 개발/테스트 전용: 사설 IP·localhost 차단을 해제한다. 운영 환경에서는 절대 켜면 안 된다.
  allowPrivateHosts: process.env.ALLOW_PRIVATE_HOSTS === '1',

  rootDir: ROOT_DIR,
  dataDir: path.join(ROOT_DIR, 'data'),
  jobsDir: path.join(ROOT_DIR, 'data', 'jobs'),
  workDir: path.join(ROOT_DIR, 'data', 'work'),
  outputDir: path.join(ROOT_DIR, 'data', 'output'),
  publicDir: path.join(ROOT_DIR, 'public'),
};
