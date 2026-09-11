import fssync from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from '../config.js';
import { assertSafeUrlFormat, UnsafeUrlError } from '../lib/ssrf.js';
import { createJob, getJob, updateJob, toPublicJob, countActiveJobsForClient } from '../lib/jobStore.js';
import { enqueueAnalyze, startJob, retryJob } from '../lib/jobManager.js';
import { PURPOSES } from '../lib/script.js';

export const router = express.Router();

const CATEGORIES = new Set(['auto', 'digital', 'health']);

// 규칙 기반 국내 쇼핑몰 URL 검사 (AI 호출 없음). 주요 오픈마켓/홈쇼핑/자사몰 플랫폼은
// 도메인 목록으로 우선 판단하고, 목록에 없는 개별 브랜드 자사몰은 .kr 도메인이면 허용한다.
const KOREAN_MALL_DOMAINS = [
  // 오픈마켓 · 종합몰
  'coupang.com', 'gmarket.co.kr', 'auction.co.kr', '11st.co.kr', 'ssg.com',
  'lotteon.com', 'lotteimall.com', 'tmon.co.kr', 'wemakeprice.com', 'interpark.com',
  'oliveyoung.co.kr', 'musinsa.com', 'kurly.com', 'naver.com', 'ohou.se',
  // TV홈쇼핑
  'shinsegaetvshopping.com', 'gsshop.com', 'hmall.com', 'cjonstyle.com', 'nsmall.com',
  // 자사몰 구축 플랫폼(이 도메인의 하위 도메인/직접 도메인 모두 허용)
  'cafe24.com', 'imweb.me', 'godomall.com', 'sixshop.com', 'makeshop.co.kr',
];
function isKoreanMallUrl(rawUrl) {
  let host;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (KOREAN_MALL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  return host.endsWith('.kr'); // 국내 쇼핑몰 자사몰 도메인은 대부분 .kr을 쓰므로 마지막 안전망으로 허용
}

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

// 완성된 영상의 나레이션(자동 생성된 mp3)만 배경음악 없이 따로 받을 수 있게 한다.
router.get('/jobs/:id/narration',asyncHandler(async(req,res)=>{
  const job=getJob(req.params.id);
  if(!job||job.clientId!==getClientId(req))return res.status(403).json({error:'이 작업에 접근할 수 없어요.'});
  if(!job.narration?.path||!fssync.existsSync(job.narration.path))return res.status(404).json({error:'나레이션 음성이 없어요.'});
  res.download(job.narration.path,'narration'+path.extname(job.narration.path));
}));

router.get('/jobs/:id/storyboard',asyncHandler(async(req,res)=>{
  const job=getJob(req.params.id);
  if(!job||job.clientId!==getClientId(req))return res.status(403).json({error:'이 작업에 접근할 수 없어요.'});
  if(!job.storyboard)return res.status(404).json({error:'아직 편집 계획이 없어요.'});
  res.json({...job.storyboard,shots:job.storyboard.shots.map(({imagePath,...shot})=>shot)});
}));

router.post(
  '/jobs',
  asyncHandler(async (req, res) => {
    const { url, category = 'auto' } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL을 입력해주세요.' });
    }
    if (!CATEGORIES.has(category)) {
      return res.status(400).json({ error: '카테고리를 선택해주세요.' });
    }
    try {
      assertSafeUrlFormat(url);
    } catch (err) {
      const status = err instanceof UnsafeUrlError ? 400 : 400;
      return res.status(status).json({ error: err.message });
    }
    if (!isKoreanMallUrl(url)) {
      return res.status(400).json({ error: '지원하지 않는 URL이에요. 다른 상품 URL로 다시 시도해주세요.' });
    }

    const clientId = getClientId(req);
    if (countActiveJobsForClient(clientId) >= config.maxActiveJobsPerClient) {
      return res.status(429).json({ error: '이미 진행 중인 작업이 있어요. 완료 후 다시 시도해주세요.' });
    }

    const job = createJob({ url, category, clientId });
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
  '/jobs/:id/cancel',
  asyncHandler(async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없어요.' });
    if (job.clientId !== getClientId(req)) {
      return res.status(403).json({ error: '이 작업에 접근할 수 없어요.' });
    }
    // 렌더링 시작 전 단계에서 사용자가 뒤로가기/처음으로 이동하면, 이 작업이 "진행 중"으로
    // 계속 잡혀 다음 작업 생성이 막히지 않도록 취소 처리한다.
    if (['queued', 'analyzing', 'awaiting_purpose'].includes(job.status)) {
      updateJob(job.id, { status: 'failed', stage: 'cancelled', error: '사용자가 취소함' });
    }
    res.json({ ok: true });
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
    const { purpose, imageSelections } = req.body || {};
    const result = startJob(req.params.id, purpose, imageSelections);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ job: toPublicJob(result.job) });
  })
);

// 목적 선택 화면에서 원본/누끼 이미지를 비교해 보여주기 위한 미리보기 파일 서빙.
router.get(
  '/jobs/:id/preview-image',
  asyncHandler(async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없어요.' });
    if (job.clientId !== getClientId(req)) {
      return res.status(403).json({ error: '이 작업에 접근할 수 없어요.' });
    }
    const index = Number(req.query.index);
    const option = Number.isInteger(index) ? job.cutoutOptions?.[index] : null;
    if (!option) return res.status(404).json({ error: '이미지를 찾을 수 없어요.' });
    const filePath = req.query.type === 'cutout' ? option.cutout : option.original;
    if (!filePath || !fssync.existsSync(filePath)) {
      return res.status(404).json({ error: '이미지를 찾을 수 없어요.' });
    }
    res.sendFile(path.resolve(filePath));
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
