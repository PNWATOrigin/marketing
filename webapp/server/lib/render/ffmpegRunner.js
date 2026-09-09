import { spawn } from 'node:child_process';
import { config } from '../../config.js';

export class FfmpegError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FfmpegError';
  }
}

// ffmpeg의 `-progress pipe:1` 출력(key=value 줄들)에서 out_time을 읽어 0~1 진행률로 변환한다.
function watchProgress(stream, totalSeconds, onProgress) {
  if (!onProgress || !totalSeconds) return;
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 마지막 줄은 아직 미완성일 수 있음
    for (const line of lines) {
      const match = /^out_time_(?:ms|us)=(\d+)/.exec(line.trim());
      if (!match) continue;
      const seconds = Number(match[1]) / 1e6;
      onProgress(Math.min(1, Math.max(0, seconds / totalSeconds)));
    }
  });
}

export function runFfmpeg(args, { timeoutMs = config.renderTimeoutMs, totalSeconds, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const fullArgs = onProgress ? ['-progress', 'pipe:1', '-nostats', ...args] : args;
    const proc = spawn(config.ffmpegPath, fullArgs);
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(new FfmpegError('영상 렌더링 시간이 초과됐어요.'));
    }, timeoutMs);

    watchProgress(proc.stdout, totalSeconds, onProgress);
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000); // 메모리 보호
    });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new FfmpegError(`ffmpeg 실행 실패: ${err.message}`));
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new FfmpegError(`ffmpeg가 오류로 종료됐어요 (code ${code}): ${stderr.slice(-2000)}`));
    });
  });
}

export function runFfprobe(args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ffprobePath, args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new FfmpegError('ffprobe 시간 초과'));
    }, timeoutMs);
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new FfmpegError(`ffprobe 오류: ${stderr.slice(-1000)}`));
    });
  });
}
