import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { runFfprobe } from './render/ffmpegRunner.js';
import { digest } from './cache.js';

const SCRIPT_PATH = fileURLToPath(new URL('./narrationTts.py', import.meta.url));

// script.js가 만든 장면(headline/sub)을 이어붙여, 화면 자막과 실제 들리는 말이 같도록
// 나레이션 대본으로 그대로 쓴다.
function scriptToText(script) {
  return script.scenes.map((s) => [s.headline, s.sub].filter(Boolean).join('. ')).join(' ').trim();
}

// 무료 TTS(edge-tts, 비공식 Microsoft Edge 음성 API)로 나레이션 음성과 단어별 타이밍을
// 만든다. storyboard.js가 이 타이밍(words)으로 장면을 자동 구성하므로, 실패하면 영상
// 제작 자체가 불가능하다는 뜻에서 예외를 그대로 던진다(다른 부가 기능과 달리 최선
// 노력으로 건너뛸 수 없는 핵심 기능이다).
export async function synthesizeNarration(job, script, voice = config.narrationVoice) {
  const text = scriptToText(script);
  if (!text) throw new Error('나레이션으로 읽을 문구를 만들지 못했어요.');
  const dir = path.join(config.dataDir, 'narrations', job.id);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'tts.mp3');

  const words = await new Promise((resolve, reject) => {
    const proc = spawn(process.env.PYTHON_PATH || 'python3', [SCRIPT_PATH, voice, file], { windowsHide: true });
    let stdout = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(new Error('나레이션 음성 생성 시간이 초과됐어요.'));
    }, config.ttsTimeoutMs);
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('나레이션 음성 생성에 실패했어요.'));
      try {
        resolve(JSON.parse(stdout).words);
      } catch {
        reject(new Error('나레이션 타이밍 분석에 실패했어요.'));
      }
    });
    proc.stdin.on('error', () => {}); // 프로세스가 이미 죽었을 때 EPIPE 방지
    proc.stdin.write(text, 'utf8');
    proc.stdin.end();
  });

  const probe = JSON.parse(
    await runFfprobe(['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file])
  );
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || !words?.length) throw new Error('나레이션 생성에 실패했어요.');
  return { path: file, duration, hash: digest(await fs.readFile(file)), words, format: 'mp3' };
}
