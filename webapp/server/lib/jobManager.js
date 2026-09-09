import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ConcurrencyQueue } from './queue.js';
import { getJob, updateJob } from './jobStore.js';
import { fetchProductPage, PageFetchError } from './fetchPage.js';
import { analyzeHtml } from './analyze.js';
import { downloadImages } from './images.js';
import { generateScript, PURPOSES } from './script.js';
import { renderVideo } from './render/renderVideo.js';
import { UnsafeUrlError } from './ssrf.js';

const analyzeQueue = new ConcurrencyQueue(config.maxAnalyzeConcurrency);
const renderQueue = new ConcurrencyQueue(config.maxRenderConcurrency);
const inFlight = new Set(); // 같은 작업이 큐에 중복으로 들어가는 것을 방지

function friendlyError(err) {
  if (err instanceof UnsafeUrlError || err instanceof PageFetchError) return err.message;
  if (err?.name === 'FfmpegError') return err.message;
  return err?.message?.length < 200 ? err.message : '알 수 없는 오류가 발생했어요. 다시 시도해주세요.';
}

export function enqueueAnalyze(jobId) {
  const key = `analyze:${jobId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  analyzeQueue.push(() => runAnalyze(jobId).finally(() => inFlight.delete(key)));
}

export function enqueueRender(jobId) {
  const key = `render:${jobId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  renderQueue.push(() => runRender(jobId).finally(() => inFlight.delete(key)));
}

async function runAnalyze(jobId) {
  const job = getJob(jobId);
  if (!job) return;
  updateJob(jobId, { status: 'analyzing', stage: 'analyzing', error: null });
  try {
    const { html, finalUrl } = await fetchProductPage(job.url);
    const product = analyzeHtml(html, finalUrl);
    updateJob(jobId, { status: 'awaiting_purpose', stage: 'awaiting_purpose', product });
  } catch (err) {
    updateJob(jobId, { status: 'failed', stage: 'analyzing', error: friendlyError(err) });
  }
}

// 실패 시 큐에 다시 넣지 않고 같은 작업 슬롯 안에서 바로 재시도한다.
// (재시도를 enqueueRender로 다시 큐에 넣으면, 이 함수를 감싸는 최초 호출의 finally가
//  방금 등록된 inFlight 표시를 지워버려 중복 실행 방지 장치가 깨지는 문제가 있었다.)
async function runRender(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  for (;;) {
    updateJob(jobId, { status: 'scripting', stage: 'scripting', error: null });
    const workDir = path.join(config.workDir, jobId);
    try {
      const script = generateScript(job.product, job.purpose);

      updateJob(jobId, { status: 'rendering', stage: 'rendering' });
      const imagePaths = await downloadImages(job.product.images, path.join(workDir, 'images'));

      await fs.mkdir(config.outputDir, { recursive: true });
      const outputPath = path.join(config.outputDir, `${jobId}.mp4`);
      await renderVideo({ scenes: script.scenes, imagePaths, outputPath });
      const { size } = await fs.stat(outputPath);

      const expiresAt = Date.now() + config.outputExpiryMinutes * 60 * 1000;
      updateJob(jobId, {
        status: 'completed',
        stage: 'completed',
        outputPath,
        outputBytes: size,
        expiresAt,
      });
      return;
    } catch (err) {
      const attempts = (job.attempts || 0) + 1;
      updateJob(jobId, { attempts });
      if (attempts < config.maxRenderAttempts) {
        updateJob(jobId, { error: friendlyError(err) });
        continue;
      }
      updateJob(jobId, { status: 'failed', stage: 'rendering', error: friendlyError(err) });
      return;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export function startJob(jobId, purposeId) {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: '작업을 찾을 수 없어요.' };
  if (!PURPOSES[purposeId]) return { ok: false, error: '알 수 없는 목적이에요.' };
  if (job.status === 'scripting' || job.status === 'rendering') {
    return { ok: true, job }; // 이미 시작됨 - 중복 요청은 그대로 현재 상태 반환
  }
  if (job.status !== 'awaiting_purpose') {
    return { ok: false, error: '지금은 영상 제작을 시작할 수 없는 상태예요.' };
  }
  const updated = updateJob(jobId, { purpose: purposeId, status: 'queued', stage: 'queued' });
  enqueueRender(jobId);
  return { ok: true, job: updated };
}

export function retryJob(jobId) {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: '작업을 찾을 수 없어요.' };
  if (job.status !== 'failed') return { ok: false, error: '실패한 작업만 다시 시도할 수 있어요.' };

  if (!job.product) {
    // 분석 단계에서 실패했다면 분석부터 다시 시도한다.
    const updated = updateJob(jobId, { status: 'queued', stage: 'queued', error: null });
    enqueueAnalyze(jobId);
    return { ok: true, job: updated };
  }
  // 렌더링 단계에서 실패했다면 렌더링부터 다시 시도한다.
  const updated = updateJob(jobId, { status: 'queued', stage: 'queued', error: null, attempts: 0 });
  enqueueRender(jobId);
  return { ok: true, job: updated };
}
