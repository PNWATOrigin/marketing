(() => {
  const STORAGE_KEYS = { clientId: 'sfas_client_id', jobId: 'sfas_job_id', url: 'sfas_url' };

  function getClientId() {
    let id = localStorage.getItem(STORAGE_KEYS.clientId);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '');
      localStorage.setItem(STORAGE_KEYS.clientId, id);
    }
    return id;
  }

  const clientId = getClientId();

  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId,
        ...(options.headers || {}),
      },
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* 응답 본문이 없을 수 있음 */
    }
    if (!res.ok) {
      const err = new Error(data.error || '요청 처리 중 오류가 발생했어요.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // --- 화면 요소 ---
  const views = {
    input: document.getElementById('view-input'),
    analyzing: document.getElementById('view-analyzing'),
    purpose: document.getElementById('view-purpose'),
    progress: document.getElementById('view-progress'),
    result: document.getElementById('view-result'),
    failed: document.getElementById('view-failed'),
  };

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el.hidden = key !== name;
    });
  }

  const urlForm = document.getElementById('url-form');
  const urlInput = document.getElementById('url-input');
  const submitBtn = document.getElementById('submit-btn');
  const inputError = document.getElementById('input-error');
  const productSummary = document.getElementById('product-summary');
  const purposeGrid = document.getElementById('purpose-grid');
  const startRenderBtn = document.getElementById('start-render-btn');
  const progressFill = document.getElementById('progress-fill');
  const progressStageLabel = document.getElementById('progress-stage-label');
  const resultVideo = document.getElementById('result-video');
  const downloadBtn = document.getElementById('download-btn');
  const remakeBtn = document.getElementById('remake-btn');
  const failedMessage = document.getElementById('failed-message');
  const retryBtn = document.getElementById('retry-btn');
  const startOverBtn = document.getElementById('start-over-btn');

  const STAGE_LABELS = {
    queued: '대기열에서 기다리는 중...',
    analyzing: '상품 정보를 분석하는 중...',
    awaiting_purpose: '분석이 끝났어요',
    scripting: '대본을 작성하는 중...',
    rendering: '영상을 렌더링하는 중...',
    completed: '완성됐어요!',
    failed: '문제가 발생했어요',
  };

  const STAGE_PROGRESS = {
    queued: 8,
    analyzing: 20,
    awaiting_purpose: 30,
    scripting: 48,
    rendering: 68,
    completed: 100,
  };

  let purposes = [];
  let selectedPurpose = null;
  let currentJobId = null;
  let pollTimer = null;
  let renderProgressTimer = null;

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function stopFakeProgress() {
    if (renderProgressTimer) clearInterval(renderProgressTimer);
    renderProgressTimer = null;
  }

  function setError(el, message) {
    el.textContent = message;
    el.hidden = !message;
  }

  function formatPrice(product) {
    if (product.price == null) return null;
    const currency = product.currency || 'KRW';
    if (currency === 'KRW') return `${Math.round(product.price).toLocaleString('ko-KR')}원`;
    return `${product.price.toLocaleString('ko-KR')} ${currency}`;
  }

  function renderProductSummary(product) {
    if (!product) {
      productSummary.innerHTML = '';
      return;
    }
    const img = product.images?.[0];
    const price = formatPrice(product);
    productSummary.innerHTML = `
      ${img ? `<img src="${img}" alt="" onerror="this.remove()" />` : ''}
      <div>
        <div class="ps-name">${escapeHtml(product.name || '상품명을 확인하지 못했어요')}</div>
        <div class="ps-meta">${[product.brand, price].filter(Boolean).map(escapeHtml).join(' · ') || '추가 정보 없음'}</div>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function loadPurposes() {
    if (purposes.length) return purposes;
    const data = await api('/purposes');
    purposes = data.purposes;
    return purposes;
  }

  function renderPurposeCards() {
    purposeGrid.innerHTML = purposes
      .map(
        (p) => `
        <button type="button" class="purpose-card" data-id="${p.id}" aria-pressed="false">
          <span class="check">✓</span>
          <h3>${escapeHtml(p.label)}</h3>
          <ul>${p.metrics.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
        </button>`
      )
      .join('');

    const cards = [...purposeGrid.querySelectorAll('.purpose-card')];
    cards.forEach((card, i) => {
      setTimeout(() => card.classList.add('show'), i * 90);
      card.addEventListener('click', () => {
        cards.forEach((c) => {
          c.classList.remove('selected');
          c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
        selectedPurpose = card.dataset.id;
        startRenderBtn.disabled = false;
      });
    });
  }

  // ffmpeg 진행률(job.progress, 0~100)이 아직 도착하기 전이나 값이 멈춰있을 때를 대비해
  // 아주 천천히 올라가는 것처럼 보이게 하는 최소한의 보조 장치. 실제 값이 오면 바로 대체된다.
  function startFakeRenderProgress() {
    stopFakeProgress();
    let value = STAGE_PROGRESS.rendering;
    renderProgressTimer = setInterval(() => {
      value = Math.min(value + 1, 90);
      progressFill.style.width = `${value}%`;
    }, 1500);
  }

  function applyJobState(job) {
    switch (job.status) {
      case 'queued':
      case 'analyzing': {
        showView('analyzing');
        break;
      }
      case 'awaiting_purpose': {
        stopFakeProgress();
        renderProductSummary(job.product);
        renderPurposeCards();
        showView('purpose');
        break;
      }
      case 'scripting':
      case 'rendering': {
        showView('progress');
        if (job.status === 'rendering' && typeof job.progress === 'number') {
          stopFakeProgress();
          const percent = Math.round(48 + (job.progress / 100) * 50);
          progressFill.style.width = `${percent}%`;
          progressStageLabel.textContent = `${STAGE_LABELS.rendering} (${job.progress}%)`;
        } else {
          progressStageLabel.textContent = STAGE_LABELS[job.status];
          progressFill.style.width = `${STAGE_PROGRESS[job.status]}%`;
          if (job.status === 'rendering' && !renderProgressTimer) startFakeRenderProgress();
        }
        break;
      }
      case 'completed': {
        stopFakeProgress();
        stopPolling();
        const src = `/api/jobs/${job.id}/download`;
        resultVideo.src = src;
        downloadBtn.href = src;
        const name = (job.product?.name || 'shortform-ad').replace(/[^\w가-힣-]+/g, '_').slice(0, 40);
        downloadBtn.setAttribute('download', `${name || 'shortform-ad'}.mp4`);
        showView('result');
        break;
      }
      case 'failed': {
        stopFakeProgress();
        stopPolling();
        setError(failedMessage, job.error || '알 수 없는 오류가 발생했어요.');
        showView('failed');
        break;
      }
      default:
        break;
    }
  }

  async function poll(jobId) {
    stopPolling();
    try {
      const { job } = await api(`/jobs/${jobId}`);
      applyJobState(job);
      if (!['completed', 'failed'].includes(job.status)) {
        // awaiting_purpose는 사용자의 선택을 기다리는 정적 상태라 다시 폴링할 필요가 없다.
        if (job.status !== 'awaiting_purpose') {
          pollTimer = setTimeout(() => poll(jobId), 1500);
        }
      }
    } catch (err) {
      console.error(err);
      pollTimer = setTimeout(() => poll(jobId), 3000);
    }
  }

  function persistJob(jobId, url) {
    currentJobId = jobId;
    localStorage.setItem(STORAGE_KEYS.jobId, jobId);
    if (url) localStorage.setItem(STORAGE_KEYS.url, url);
  }

  function clearJob() {
    currentJobId = null;
    selectedPurpose = null;
    localStorage.removeItem(STORAGE_KEYS.jobId);
    stopPolling();
    stopFakeProgress();
  }

  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError(inputError, '');
    const url = urlInput.value.trim();
    if (!url) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '분석 요청 중...';
    try {
      await loadPurposes();
      const { job } = await api('/jobs', { method: 'POST', body: JSON.stringify({ url }) });
      persistJob(job.id, url);
      showView('analyzing');
      poll(job.id);
    } catch (err) {
      setError(inputError, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '영상 만들기';
    }
  });

  startRenderBtn.addEventListener('click', async () => {
    if (!selectedPurpose || !currentJobId) return;
    startRenderBtn.disabled = true;
    try {
      const { job } = await api(`/jobs/${currentJobId}/start`, {
        method: 'POST',
        body: JSON.stringify({ purpose: selectedPurpose }),
      });
      applyJobState(job);
      poll(currentJobId);
    } catch (err) {
      alert(err.message);
      startRenderBtn.disabled = false;
    }
  });

  retryBtn.addEventListener('click', async () => {
    if (!currentJobId) return;
    retryBtn.disabled = true;
    try {
      const { job } = await api(`/jobs/${currentJobId}/retry`, { method: 'POST' });
      applyJobState(job);
      poll(currentJobId);
    } catch (err) {
      setError(failedMessage, err.message);
    } finally {
      retryBtn.disabled = false;
    }
  });

  function resetToInput() {
    clearJob();
    urlInput.value = localStorage.getItem(STORAGE_KEYS.url) || '';
    setError(inputError, '');
    showView('input');
  }

  startOverBtn.addEventListener('click', resetToInput);
  remakeBtn.addEventListener('click', resetToInput);

  // --- 초기 로드: 이전에 진행 중이던 작업이 있으면 이어서 확인한다 ---
  (async function init() {
    await loadPurposes().catch(() => {});
    const savedUrl = localStorage.getItem(STORAGE_KEYS.url);
    if (savedUrl) urlInput.value = savedUrl;

    const savedJobId = localStorage.getItem(STORAGE_KEYS.jobId);
    if (savedJobId) {
      currentJobId = savedJobId;
      try {
        const { job } = await api(`/jobs/${savedJobId}`);
        applyJobState(job);
        if (!['completed', 'failed'].includes(job.status)) poll(savedJobId);
      } catch {
        clearJob();
        showView('input');
      }
    } else {
      showView('input');
    }
  })();
})();
