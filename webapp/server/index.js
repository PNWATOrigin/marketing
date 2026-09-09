import express from 'express';
import { config } from './config.js';
import { router as apiRouter } from './routes/api.js';
import { loadJobsFromDisk, cleanupExpiredJobs } from './lib/jobStore.js';
import { resolveFonts } from './lib/render/fonts.js';

// 필요한 폰트가 없으면 렌더링 중간이 아니라 서버 시작 시점에 바로 알려준다.
try {
  resolveFonts();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

await loadJobsFromDisk();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(config.publicDir));
app.use('/api', apiRouter);

app.use((req, res) => {
  res.status(404).json({ error: '요청하신 경로를 찾을 수 없어요.' });
});

// 하나의 요청 처리 중 발생한 오류가 서버 전체를 죽이지 않도록 마지막에서 잡아준다.
app.use((err, req, res, _next) => {
  console.error('요청 처리 중 오류:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: '서버에서 문제가 발생했어요. 잠시 후 다시 시도해주세요.' });
});

process.on('unhandledRejection', (err) => {
  console.error('처리되지 않은 Promise 오류:', err);
});
process.on('uncaughtException', (err) => {
  console.error('처리되지 않은 예외:', err);
});

setInterval(() => {
  cleanupExpiredJobs().catch((err) => console.error('작업 정리 중 오류:', err));
}, config.cleanupIntervalMinutes * 60 * 1000).unref();

app.listen(config.port, () => {
  console.log(`숏폼 광고 스튜디오 서버가 http://localhost:${config.port} 에서 실행 중이에요.`);
});
