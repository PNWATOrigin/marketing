import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { runFfprobe } from './render/ffmpegRunner.js';
import { cached, digest } from './cache.js';

export function validateTranscript(input, duration) {
  const list = input?.words || input?.segments || input;
  if (!Array.isArray(list) || !list.length || list.length > 500) throw new Error('시간 정보가 있는 자막이 필요해요.');
  let previousEnd = 0;
  return list.map(item => {
    const start = Number(item.start), end = Number(item.end);
    const text = String(item.word ?? item.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 160 || !Number.isFinite(start) || !Number.isFinite(end) || start < previousEnd - 0.04 || end <= start || end > duration + 0.05) throw new Error('자막 시간은 순서대로, 음성 길이 안에 있어야 해요.');
    previousEnd = end;
    return { start: Math.max(0, start), end: Math.min(duration, end), text };
  });
}

export function parseTimedText(text) {
  try { return JSON.parse(text); } catch {}
  const time = value => { const [h,m,s] = value.replace(',', '.').split(':').map(Number); return h*3600+m*60+s; };
  const cues = [...text.replace(/\r/g,'').matchAll(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g)];
  return cues.map(m => ({ start: time(m[1]), end: time(m[2]), text: m[3].replace(/<[^>]*>/g,'') }));
}

export async function registerNarration(job, bytes, contentType) {
  const formats = { 'audio/mpeg': ['mp3','.mp3'], 'audio/mp3':['mp3','.mp3'], 'audio/wav':['wav','.wav'], 'audio/x-wav':['wav','.wav'], 'audio/mp4':['mov','.m4a'], 'audio/x-m4a':['mov','.m4a'] };
  const format = formats[contentType];
  if (!format || !Buffer.isBuffer(bytes) || bytes.length < 100 || bytes.length > 20*1024*1024) throw new Error('20MB 이하의 MP3, WAV, M4A 음성을 선택해주세요.');
  const dir = path.join(config.dataDir, 'narrations', job.id);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, digest(bytes) + format[1]);
  await fs.writeFile(file, bytes);
  try {
    const probe = JSON.parse(await runFfprobe(['-v','error','-protocol_whitelist','file,pipe','-f',format[0],'-show_entries','format=duration:stream=codec_type,duration','-of','json',file]));
    const stream = probe.streams?.find(s => s.codec_type === 'audio');
    const duration = Number(stream?.duration || probe.format?.duration);
    if (!stream || !Number.isFinite(duration) || duration < 13 || duration > 17) throw new Error('원본을 자르지 않도록 13~17초 나레이션을 선택해주세요.');
    return { path: file, duration, hash: digest(bytes), words: null, format: format[0] };
  } catch (error) { await fs.rm(file, { force: true }); throw error; }
}

export async function transcribeNarration(job) {
  const narration = job.narration;
  if (!narration) throw new Error('기존 나레이션 음성을 먼저 등록해주세요.');
  if (narration.words?.length) return narration;
  if (!process.env.OPENAI_API_KEY) throw new Error('자동 음성 인식 연결이 필요해요. 지금은 음성과 시간 자막(SRT/JSON)을 함께 등록할 수 있어요.');
  const words = await cached('transcripts-v1', `${job.clientId}:${narration.hash}`, async () => {
    const form = new FormData();
    form.append('file', new Blob([await fs.readFile(narration.path)]), path.basename(narration.path));
    form.append('model', 'whisper-1');
    form.append('language', 'ko');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}, body:form, signal:AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`음성 인식 연결을 확인해주세요. (${response.status})`);
    return validateTranscript(await response.json(), narration.duration);
  });
  return { ...narration, words };
}
