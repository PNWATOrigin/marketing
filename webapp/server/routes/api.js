import fssync from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from '../config.js';
import { assertSafeUrlFormat, UnsafeUrlError } from '../lib/ssrf.js';
import { createJob, getJob, toPublicJob, countActiveJobsForClient } from '../lib/jobStore.js';
import { enqueueAnalyze, startJob, retryJob } from '../lib/jobManager.js';
import { PURPOSES } from '../lib/script.js';

export const router = express.Router();

function getClientId(req) {
  const header = req.get('x-client-id');
  if (header && /^[a-zA-Z0-9_-]{8,64}$/.test(header)) return header;
  return `ip:${req.ip}`;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/purposes', (req, res) => {
  res.json({ purposes: Object.values(PURPOSES) });
});

router.post(
  '/jobs',
  asyncHandler(async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL을 입력해주세요.' });
    }
    try {
      assertSafeUrlFormat(url);
    } catch (err) {
      const status = err instanceof UnsafeUrlError ? 400 : 400;
      return res.status(status).json({ error: err.message });
    }

    const clientId = getClientId(req);
    if (countActiveJobsForClient(clientId) >= config.maxActiveJobsPerClient) {
      return res.status(429).json({ error: '이미 진행 중인 작업이 있어요. 완료 후 다시 시도해주세요.' });
    }

    const job = createJob({ url, clientId });
    enqueueAnalyze(job.id);
    res.status(201).json({ job: toPublicJob(job) });
  })
);

router.get(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없어요.' });
    res.json({ job: toPublicJob(job) });
  })
);

router.post(
  '/jobs/:id/start',
  asyncHandler(async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없어요.' });
    if (job.clientId !== getClientId(req)) {
      return res.status(403).json({ error: '이 작업에 접근할 수 없어요.' });
    }
    const { purpose } = req.body || {};
    const result = startJob(req.params.id, purpose);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ job: toPublicJob(result.job) });
  })
);

router.post(
  '/jobs/:id/retry',
  asyncHandler(async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없어요.' });
    if (job.clientId !== getClientId(req)) {
      return res.status(403).json({ error: '이 작업에 접근할 수 없어요.' });
    }
    const result = retryJob(req.params.id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ job: toPublicJob(result.job) });
  })
);

router.get(
  '/jobs/:id/download',
  asyncHandler(async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없어요.' });
    if (job.status !== 'completed' || !job.outputPath) {
      return res.status(404).json({ error: '아직 완성된 영상이 없어요.' });
    }
    if (job.expiresAt && job.expiresAt < Date.now()) {
      return res.status(410).json({ error: '다운로드 유효 기간이 지났어요. 다시 만들어주세요.' });
    }
    if (!fssync.existsSync(job.outputPath)) {
      return res.status(404).json({ error: '영상 파일을 찾을 수 없어요.' });
    }
    // Content-Disposition: attachment을 쓰면 크롬 <video> 미리보기가 디먹싱에 실패한다.
    // inline으로 스트리밍하고, 실제 "다운로드"는 클라이언트의 <a download> 속성이 처리한다.
    res.sendFile(path.resolve(job.outputPath), { headers: { 'Content-Type': 'video/mp4' } });
  })
);
