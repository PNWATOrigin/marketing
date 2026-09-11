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

  // 규칙 기반 국내 쇼핑몰 URL 검사 (AI 호출 없음, 서버와 동일한 규칙).
  const KOREAN_MALL_DOMAINS = [
    'nutridday.com', 'coupang.com', 'gmarket.co.kr', 'auction.co.kr', '11st.co.kr', 'ssg.com',
    'lotteon.com', 'lotteimall.com', 'tmon.co.kr', 'wemakeprice.com', 'interpark.com',
    'oliveyoung.co.kr', 'musinsa.com', 'kurly.com', 'naver.com', 'ohou.se',
    'shinsegaetvshopping.com', 'gsshop.com', 'hmall.com', 'cjonstyle.com', 'nsmall.com',
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
    return host.endsWith('.kr');
  }

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
  const categoryGroup = document.getElementById('category-group');
  let selectedCategory = null;

  categoryGroup.querySelectorAll('.category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      categoryGroup.querySelectorAll('.category-chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedCategory = chip.dataset.category;
      submitBtn.disabled = false;
    });
  });
  const inputError = document.getElementById('input-error');
  const productSummary = document.getElementById('product-summary');
  const purposeGrid = document.getElementById('purpose-grid');
  const startRenderBtn = document.getElementById('start-render-btn');
  const progressFill = document.getElementById('progress-fill');
  const progressStageLabel = document.getElementById('progress-stage-label');
  const previewPanel = document.getElementById('render-preview');
  const previewImg = document.getElementById('render-preview-img');
  const resultVideo = document.getElementById('result-video');
  const downloadBtn = document.getElementById('download-btn');
  const sourcesBtn = document.getElementById('sources-btn');
  const sourceOptions=document.getElementById('source-options');
  sourcesBtn.addEventListener('click',()=>{sourceOptions.showModal();});
  document.getElementById('source-close').addEventListener('click',()=>sourceOptions.close());
  for(const format of ['zip','xml'])document.getElementById(`source-${format}`).addEventListener('click',async()=>{
    sourceOptions.close();
    sourcesBtn.disabled=true;
    try{
      const response=await fetch(`/api/jobs/${currentJobId}/sources?format=${format}`,{headers:{'X-Client-Id':clientId}});
      if(!response.ok)throw new Error('편집 소스가 없거나 만료됐어요. 새로 제작해주세요.');
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
      const disposition=response.headers.get('Content-Disposition')||'';
      const encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      link.href=url;link.download=encoded?decodeURIComponent(encoded):`short studio_상품.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(err){alert(err.message);}finally{sourcesBtn.disabled=false;}
  });
  const remakeBtn = document.getElementById('remake-btn');
  const failedMessage = document.getElementById('failed-message');
  const retryBtn = document.getElementById('retry-btn');
  const startOverBtn = document.getElementById('start-over-btn');

  const STAGE_LABELS = {
    queued: '대기열에서 기다리는 중...',
    analyzing: '상품 정보를 분석하는 중...',
    awaiting_purpose: '분석이 끝났어요',
    scripting: '대본을 작성하는 중...',
    completed: '완성됐어요!',
    failed: '문제가 발생했어요',
  };

  // 렌더링 진행률(%) 구간에 따라 실제로 진행 중인 작업에 가까운 문구로 천천히 바꿔 보여준다.
  const RENDERING_PHASES = [
    [15, '이미지를 준비하는 중...'],
    [35, '장면을 구성하는 중...'],
    [60, '자막과 효과를 입히는 중...'],
    [90, '영상으로 인코딩하는 중...'],
    [100, '마무리하는 중...'],
  ];
  function renderingPhaseLabel(percent) {
    return (RENDERING_PHASES.find(([max]) => percent <= max) || RENDERING_PHASES.at(-1))[1];
  }

  const STAGE_PROGRESS = {
    queued: 1,
    analyzing: 3,
    awaiting_purpose: 5,
    scripting: 6,
    completed: 100,
  };

  let purposes = [];
  let selectedPurpose = null;
  let currentJobId = null;
  let pollTimer = null;
  let renderProgressTimer = null;
  let previewTimer = null;
  let previewIndex = 0;

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

  function renderProductSummary(product) {
    if (!product) {
      productSummary.innerHTML = '';
      return;
    }
    const img = product.images?.[0];
    productSummary.innerHTML = `
      ${img ? `<img src="${escapeHtml(img)}" alt="" onerror="this.remove()" />` : ''}
      <div>
        <div class="ps-name">${escapeHtml(product.displayName || product.name || '상품명을 확인하지 못했어요')}</div>
        ${product.brand ? `<div class="ps-meta">${escapeHtml(product.brand)}</div>` : ''}
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
          <img class="purpose-card-img" src="/img/card-${p.id}.png" alt="${escapeHtml(p.label)}" />
          <span class="purpose-card-compact"><span class="badge-icon">✦</span>${escapeHtml(p.label)}</span>
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
    if (renderProgressTimer) return;
    let value = STAGE_PROGRESS.scripting;
    const render = () => {
      progressFill.style.width = `${value}%`;
      progressStageLabel.textContent = `${STAGE_LABELS.scripting} (${value}%)`;
      progressStageLabel.title = "대본 작성 단계의 예상 진행률입니다.";
    };
    render();
    renderProgressTimer = setInterval(() => {
      value = Math.min(value + 1, 15);
      render();
    }, 1000);
  }

  // 제작 중에는 상세페이지 상품 이미지만 빠르게 순환한다.
  function startPreviewCycle(job) {
    const images = job.previewCount?Array.from({length:job.previewCount},(_,i)=>`/api/jobs/${currentJobId}/preview/${i}?clientId=${encodeURIComponent(clientId)}`):[...new Set(job.product?.images || [])];
    const key=images.join('|');
    if(previewTimer&&previewPanel.dataset.images===key)return;
    if(previewTimer)clearInterval(previewTimer);
    previewPanel.dataset.images=key;
    if (!images.length) return;
    previewPanel.hidden = false;
    previewIndex = 0;
    const render = () => {
      const img = images.length ? images[previewIndex % images.length] : null;
      previewImg.style.visibility = img ? 'visible' : 'hidden';
      if (img) previewImg.src = img;
      previewIndex += 1;
    };
    render();
    previewTimer = setInterval(render, 1000);
  }

  function stopPreviewCycle() {
    if (previewTimer) clearInterval(previewTimer);
    previewTimer = null;
    previewPanel.hidden = true;
  }

  function applyJobState(job) {
    switch (job.status) {
      case 'queued':
      case 'analyzing': {
        stopPreviewCycle();
        showView('analyzing');
        break;
      }
      case 'awaiting_purpose': {
        stopFakeProgress();
        stopPreviewCycle();
        renderProductSummary(job.product);
        renderPurposeCards();
        showView('purpose');
        break;
      }
      case 'scripting':
      case 'rendering': {
        showView('progress');
        startPreviewCycle(job);
        if (job.status === 'rendering' && typeof job.progress === 'number') {
          stopFakeProgress();
          const value = Math.max(1, job.progress, parseFloat(progressFill.style.width) || 0);
          progressFill.style.width = `${value}%`;
          progressStageLabel.textContent = `${renderingPhaseLabel(value)} (${value}%)`;
        } else {
          startFakeRenderProgress();
        }
        break;
      }
      case 'completed': {
        stopFakeProgress();
        stopPreviewCycle();
        stopPolling();
        const src = `/api/jobs/${job.id}/download`;
        resultVideo.src = src;
        downloadBtn.href = src;
        sourcesBtn.hidden=!job.sourcesReady;
        if(sourceOptions.open)sourceOptions.close();
        const name = (job.product?.name || 'shortform-ad').replace(/[^\w가-힣-]+/g, '_').slice(0, 40);
        downloadBtn.setAttribute('download', `shorts studio_${name || 'shortform-ad'}.mp4`);
        showView('result');
        break;
      }
      case 'failed': {
        stopFakeProgress();
        stopPreviewCycle();
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
    if (currentJobId) {
      // 렌더링 시작 전 단계에서 나가는 경우, 서버에 취소를 알려 "진행 중" 슬롯을 비워준다.
      api(`/jobs/${currentJobId}/cancel`, { method: 'POST' }).catch(() => {});
    }
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
    if (!url || !selectedCategory) return;
    if (!isKoreanMallUrl(url)) {
      setError(inputError, '지원하지 않는 URL이에요. 다른 상품 URL로 다시 시도해주세요.');
      return;
    }

    submitBtn.disabled = true;
    try {
      await loadPurposes();
      const { job } = await api('/jobs', { method: 'POST', body: JSON.stringify({ url, category: selectedCategory }) });
      persistJob(job.id, url);
      showView('analyzing');
      poll(job.id);
    } catch (err) {
      setError(inputError, err.message);
    } finally {
      submitBtn.disabled = false;
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
  document.getElementById('logo-home-btn').addEventListener('click', resetToInput);
  document.getElementById('purpose-back-btn').addEventListener('click', resetToInput);

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
