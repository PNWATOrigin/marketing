import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ConcurrencyQueue } from './queue.js';
import { getJob, updateJob, setJobProgress } from './jobStore.js';
import { fetchProductPage, PageFetchError } from './fetchPage.js';
import { analyzeHtml } from './analyze.js';
import { downloadImages } from './images.js';
import { generateScript, PURPOSES } from './script.js';
import { renderVideo } from './render/renderVideo.js';
import { UnsafeUrlError } from './ssrf.js';
import { ocrImage, extractCleanLines } from './ocr.js';
import { cutoutOnBackground } from './cutout.js';
import { ensureGradientBackground } from './render/gradient.js';

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

// 상세 이미지 1~2장을 내려받아 OCR로 읽고, 짧고 깨끗해 보이는 줄만 추가 특징으로 반영한다.
// 무료 로컬 OCR이라 완벽하지 않을 수 있어 최선 노력으로만 동작하고, 실패해도 상품 분석
// 자체는 계속 진행된다(정보를 지어내지 않는다는 원칙을 지키기 위해 애매한 줄은 버림).
async function enrichWithImageText(product, workDir) {
  try {
    // 세로로 긴 "상세페이지" 이미지 한 장이 여러 조각으로 잘릴 수 있어 후보 URL을
    // 넉넉히 잡고, 실제 OCR 대상 수는 따로 제한해 전체 처리 시간을 지킨다.
    const targets = (product.images || []).slice(0, 4);
    if (!targets.length) return;
    const imagePaths = (await downloadImages(targets, workDir, { max: 4 })).slice(0, 6);
    const texts = await Promise.all(imagePaths.map((p) => ocrImage(p, config.ocrTimeoutMs)));
    const lines = extractCleanLines(texts.join('\n'), 4 - (product.features?.length || 0));
    if (lines.length) product.features = [...(product.features || []), ...lines].slice(0, 4);
  } catch {
    // OCR은 부가 기능이므로 실패해도 무시한다.
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// 상품 이미지 최대 3장에 대해 "누끼" 미리보기를 미리 만들어 둔다. 목적 선택 화면에서
// 사용자가 원본과 누끼 결과를 직접 비교하고 영상에 쓸 쪽을 고를 수 있게 하기 위함이다.
// 여기서 만든 결과는 렌더링 단계에서 그대로 재사용해 rembg를 두 번 돌리지 않는다.
// 실패해도(rembg 실패, 이미지 다운로드 실패 등) 미리보기는 부가 기능이므로 빈 배열을
// 반환하고, 그 경우 렌더링은 기존처럼 자동 누끼 시도로 되돌아간다.
async function prepareCutoutPreviews(product, jobId) {
  const targets = (product.images || []).slice(0, 3);
  if (!targets.length) return [];
  try {
    const previewDir = path.join(config.workDir, jobId, 'previews');
    const originals = await downloadImages(targets, previewDir, { max: 3 });
    if (!originals.length) return [];
    const bg = await ensureGradientBackground();
    return await Promise.all(
      originals.map(async (originalPath, i) => {
        const cutoutPath = path.join(previewDir, `cutout_${i}.jpg`);
        const cutout = await cutoutOnBackground(originalPath, cutoutPath, bg).catch(() => null);
        return { index: i, original: originalPath, cutout };
      })
    );
  } catch {
    return [];
  }
}

async function runAnalyze(jobId) {
  const job = getJob(jobId);
  if (!job) return;
  updateJob(jobId, { status: 'analyzing', stage: 'analyzing', error: null });
  try {
    const { html, finalUrl } = await fetchProductPage(job.url);
    const product = analyzeHtml(html, finalUrl);
    await enrichWithImageText(product, path.join(config.workDir, jobId, 'ocr'));
    const cutoutOptions = await prepareCutoutPreviews(product, jobId);
    const imageSelections = cutoutOptions.map((o) => (o.cutout ? 'cutout' : 'original'));
    updateJob(jobId, { status: 'awaiting_purpose', stage: 'awaiting_purpose', product, cutoutOptions, imageSelections });
  } catch (err) {
    updateJob(jobId, { status: 'failed', stage: 'analyzing', error: friendlyError(err) });
  }
}

// 실제 진행률 보고가 느리거나(느린 이미지, 느린 서버 CPU) 잠시 멈춰도 화면 숫자가
// 계속 살아 움직이도록 하는 감시 타이머. 진짜 값이 오면 그 값을 우선하고,
// 1.5초 넘게 새 값이 없으면 스스로 조금씩 올려서 "멈춘 것처럼" 보이지 않게 한다.
function startProgressWatchdog(jobId) {
  let last = 0;
  let lastAt = Date.now();
  const report = (value) => {
    last = Math.max(last, value);
    lastAt = Date.now();
    setJobProgress(jobId, last);
  };
  const timer = setInterval(() => {
    if (Date.now() - lastAt > 1000 && last < 95) {
      last += 1;
      setJobProgress(jobId, last);
    }
  }, 1000);
  return { report, stop: () => clearInterval(timer) };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// 상세 이미지 배경을 무료 로컬 모델(rembg)로 "누끼"딴 뒤 브랜드 그라데이션 배경 위에
// 합성해서, 원본 사진 대신 깔끔한 컷아웃 이미지를 장면에 쓸 수 있게 한다. 목적 선택
// 화면에서 사용자가 원본/누끼 중 고른 결과(job.imageSelections)가 있으면 그대로 따르고,
// 이미 만들어둔 미리보기 누끼 파일(job.cutoutOptions)이 있으면 재사용해 다시 계산하지
// 않는다. 선택 정보가 없으면(미리보기 생성 실패 등) 기존처럼 자동으로 누끼를 시도한다.
// 이미지별 최선 노력이라 실패하면 그냥 원본 이미지 경로를 그대로 둔다(전체를 막지 않음).
async function applyCutouts(imagePaths, workDir, job) {
  const targets = imagePaths.slice(0, 3);
  const selections = job?.imageSelections || [];
  const options = job?.cutoutOptions || [];
  try {
    const bg = await ensureGradientBackground();
    const results = await Promise.all(
      targets.map(async (imgPath, i) => {
        if (selections[i] === 'original') return null;
        const cached = options[i]?.cutout;
        if (cached && (await fileExists(cached))) return cached;
        if (selections[i] === 'cutout') return null; // 캐시가 없어졌으면 원본 유지(다시 계산하지 않음)
        const outPath = path.join(workDir, `cutout_${i}.jpg`);
        return cutoutOnBackground(imgPath, outPath, bg).catch(() => null);
      })
    );
    results.forEach((outPath, i) => {
      if (outPath) imagePaths[i] = outPath;
    });
  } catch {
    // 누끼 기능은 부가 기능이므로 실패해도 원본 이미지로 계속 진행한다.
  }
}

// 실패 시 큐에 다시 넣지 않고 같은 작업 슬롯 안에서 바로 재시도한다.
// (재시도를 enqueueRender로 다시 큐에 넣으면, 이 함수를 감싸는 최초 호출의 finally가
//  방금 등록된 inFlight 표시를 지워버려 중복 실행 방지 장치가 깨지는 문제가 있었다.)
async function runRender(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  for (;;) {
    updateJob(jobId, { status: 'scripting', stage: 'scripting', error: null, progress: null });
    const workDir = path.join(config.workDir, jobId);
    const watchdog = startProgressWatchdog(jobId);
    try {
      const script = generateScript(job.product, job.purpose, job.category);
      const scenes = script.scenes.map((s) => ({ headline: s.headline, sub: s.sub || null }));

      updateJob(jobId, { status: 'rendering', stage: 'rendering', progress: 0, scenes });
      // 이미지 다운로드(0~10%)와 ffmpeg 인코딩(10~100%)을 하나의 진행률로 이어붙인다.
      const imagePaths = await downloadImages(job.product.images, path.join(workDir, 'images'), {
        onEach: (done, total) => watchdog.report(total ? Math.round((done / total) * 10) : 0),
      });
      await applyCutouts(imagePaths, path.join(workDir, 'images'), job);

      await fs.mkdir(config.outputDir, { recursive: true });
      const outputPath = path.join(config.outputDir, `${jobId}.mp4`);
      await renderVideo({
        scenes: script.scenes,
        imagePaths,
        outputPath,
        purpose: job.purpose,
        onProgress: (fraction) => watchdog.report(Math.round(10 + fraction * 90)),
      });
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
      watchdog.stop();
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// imageSelections: 목적 선택 화면에서 사용자가 고른 이미지별 'original'|'cutout' 배열.
// 넘기지 않으면(또는 형식이 안 맞으면) 분석 단계에서 정한 기본값을 그대로 사용한다.
export function startJob(jobId, purposeId, imageSelections) {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: '작업을 찾을 수 없어요.' };
  if (!PURPOSES[purposeId]) return { ok: false, error: '알 수 없는 목적이에요.' };
  if (job.status === 'scripting' || job.status === 'rendering') {
    return { ok: true, job }; // 이미 시작됨 - 중복 요청은 그대로 현재 상태 반환
  }
  if (job.status !== 'awaiting_purpose') {
    return { ok: false, error: '지금은 영상 제작을 시작할 수 없는 상태예요.' };
  }
  const patch = { purpose: purposeId, status: 'queued', stage: 'queued' };
  if (Array.isArray(imageSelections)) {
    patch.imageSelections = imageSelections.map((s) => (s === 'original' ? 'original' : 'cutout'));
  }
  const updated = updateJob(jobId, patch);
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
