import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { simplifyApplianceName } from './script.js';

// 작업 상태 흐름: queued -> analyzing -> awaiting_purpose -> (사용자가 목적 선택) ->
//                queued -> scripting -> rendering -> completed / failed
const jobs = new Map();

function jobFilePath(id) {
  return path.join(config.jobsDir, `${id}.json`);
}

async function persist(job) {
  try {
    await fs.mkdir(config.jobsDir, { recursive: true });
    await fs.writeFile(jobFilePath(job.id), JSON.stringify(job));
  } catch (err) {
    console.error('작업 상태 저장 실패:', err.message);
  }
}

export function createJob({ url, category, clientId }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const job = {
    id,
    url,
    category,
    clientId,
    status: 'queued',
    stage: 'queued',
    purpose: null,
    product: null,
    warnings: [],
    error: null,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    outputPath: null,
    outputBytes: null,
    expiresAt: null,
    progress: null,
  };
  jobs.set(id, job);
  persist(job);
  return job;
}

// 렌더링 중 ffmpeg 진행률(0~100)처럼 아주 자주 바뀌는 값은 디스크에 매번 쓰지 않고
// 메모리만 갱신한다 (서버가 재시작되면 진행 중이던 작업은 어차피 실패로 표시되므로
// 진행률 값 자체를 영속화할 필요가 없다).
export function setJobProgress(id, progress) {
  const job = jobs.get(id);
  if (!job) return;
  job.progress = progress;
  job.updatedAt = Date.now();
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  persist(job);
  return job;
}

// 같은 브라우저(클라이언트)가 동시에 여러 작업을 만드는 것을 막기 위한 활성 작업 수 계산.
const ACTIVE_STATUSES = new Set(['queued', 'analyzing', 'awaiting_purpose', 'scripting', 'rendering']);

export function countActiveJobsForClient(clientId) {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.clientId === clientId && ACTIVE_STATUSES.has(job.status)) count++;
  }
  return count;
}

export function toPublicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    category: job.category,
    purpose: job.purpose,
    product: job.product
      ? {
          name: job.product.name,
          // 디지털/가전 상품명은 브랜드·스펙·옵션이 잔뜩 붙어("삼성전자 무풍 AI...")
          // 분석 화면에 그대로 보여주면 어색해서, 알아본 제품 종류(에어컨 등)가 있으면
          // 짧게 보여줄 이름을 함께 내려준다. 없으면 원래 이름을 그대로 쓴다.
          displayName: (job.category === 'digital' && simplifyApplianceName(job.product.name)) || job.product.name,
          brand: job.product.brand,
          price: job.product.price,
          originalPrice: job.product.originalPrice,
          priceSource: job.product.priceSource || null,
          currency: job.product.currency,
          description: job.product.description,
          images: job.product.images.slice(0, 3),
          warnings: job.product.warnings,
        }
      : null,
    scenes: job.scenes || null,
    // 실제 파일 경로는 노출하지 않고, 누끼 결과 존재 여부만 알려준다.
    cutoutOptions: (job.cutoutOptions || []).map((o) => ({ index: o.index, hasCutout: !!o.cutout })),
    imageSelections: job.imageSelections || [],
    error: job.error,
    attempts: job.attempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    downloadReady: job.status === 'completed' && !!job.outputPath && (!job.expiresAt || job.expiresAt > Date.now()),
    expiresAt: job.expiresAt,
  };
}

// 서버 재시작 후에도(사용자가 다시 접속했을 때) 이전 작업 상태를 확인할 수 있도록 디스크에서 복구한다.
export async function loadJobsFromDisk() {
  try {
    await fs.mkdir(config.jobsDir, { recursive: true });
    const files = await fs.readdir(config.jobsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(config.jobsDir, file), 'utf-8');
        const job = JSON.parse(raw);
        // 재시작 시점에 진행 중이던 작업은 재개할 수 없으므로 실패로 표시한다.
        if (ACTIVE_STATUSES.has(job.status)) {
          job.status = 'failed';
          job.error = '서버가 재시작되어 작업이 중단됐어요. 다시 시도해주세요.';
        }
        jobs.set(job.id, job);
      } catch {
        // 손상된 파일은 건너뛴다.
      }
    }
  } catch {
    // 최초 실행이라 폴더가 없을 수 있다.
  }
}

// 만료되었거나 오래된 작업의 임시 파일과 기록을 정리한다.
export async function cleanupExpiredJobs() {
  const now = Date.now();
  for (const job of jobs.values()) {
    const isTerminal = job.status === 'completed' || job.status === 'failed';
    const expired = job.expiresAt && job.expiresAt < now;
    const stale = isTerminal && now - job.updatedAt > config.outputExpiryMinutes * 60 * 1000 * 4;
    if (!expired && !stale) continue;

    if (job.outputPath && fssync.existsSync(job.outputPath)) {
      await fs.rm(job.outputPath, { force: true }).catch(() => {});
    }
    const workDir = path.join(config.workDir, job.id);
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    if (stale) {
      jobs.delete(job.id);
      await fs.rm(jobFilePath(job.id), { force: true }).catch(() => {});
    } else if (expired && job.status === 'completed') {
      updateJob(job.id, { outputPath: null });
    }
  }
}
