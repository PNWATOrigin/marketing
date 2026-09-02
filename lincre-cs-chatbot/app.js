const products = [
  { id: 'daily-set', name: '데일리 케어 세트', detail: '수분 진정 3종', price: 39000, emoji: '🧴' },
  { id: 'blue-shirt', name: '블루 라인 셔츠', detail: '오버핏 · 2 colors', price: 49000, emoji: '👕' },
  { id: 'cloud-bag', name: '클라우드 미니백', detail: '가벼운 데일리백', price: 59000, emoji: '👜' },
  { id: 'lip-balm', name: '소프트 글로우 립밤', detail: '맑은 블루베리빛', price: 18000, emoji: '💄' },
];

const responseBank = {
  delivery: [
    '배송이 궁금하셨죠? 🚚 현재 주문 LC-20394는 상품 준비 중으로 확인돼요. 출고되면 운송장과 함께 바로 알려드릴게요 :)',
    '확인해볼게요! 📦 지금은 배송 준비 단계예요. 배송 일정·주소 변경처럼 주문 확인이 필요한 내용은 담당자에게 이어서 연결해드릴게요 🙏',
  ],
  refund: [
    '환불 건은 주문 상태를 확인해야 정확하게 안내드릴 수 있어요. 제가 담당자에게 바로 연결해드릴게요 🙏 주문번호가 있으면 함께 남겨주세요.',
    '아이고, 불편하셨겠어요 😢 환불 가능 여부와 처리 일정은 담당자가 주문 내역을 확인한 뒤 안내드릴게요. 상담 연결 버튼을 눌러주세요.',
  ],
  cancel: [
    '주문 취소 요청 확인했어요. 이미 출고됐는지 먼저 확인해야 해서 담당자에게 바로 넘겨드릴게요 🙏 주문번호를 알려주시면 더 빠르게 도와드릴 수 있어요.',
  ],
  return: [
    '반품 접수는 상품 상태와 주문 정보를 함께 확인해야 해요. 담당자가 절차와 회수 일정을 안내드리도록 연결해드릴게요 📮',
  ],
  exchange: [
    '교환 문의군요 :) 사이즈·색상 재고 확인이 필요해서 담당자에게 이어서 연결해드릴게요. 원하시는 옵션도 같이 남겨주세요 ✨',
  ],
  order: [
    '최근 주문은 LC-20394, “린크레 데일리 케어 세트”예요. 지금은 배송 준비 중이고, 상품을 더 담아 바로 결제할 수도 있어요 📦',
  ],
  product: [
    '지금 분위기에는 데일리 케어 세트와 소프트 글로우 립밤 조합이 잘 어울려요 ✨ 부담 없이 쓰기 좋은 구성이라 먼저 담아보셔도 좋아요.',
    '찾으시는 느낌을 조금 알 것 같아요 :) 블루 라인 셔츠는 가볍게 입기 좋고, 클라우드 미니백을 같이 매치하면 톤이 예쁘게 이어져요 💙',
  ],
  payment: [
    '장바구니에서 “결제 진행하기”를 누르면 주문 정보 입력 후 안전한 결제창으로 이어지게 만들 수 있어요 💳 카드번호는 이 채팅에 입력하지 말아주세요.',
  ],
  greeting: [
    '반가워요 :) 오늘도 편하게 도와드릴게요. 배송·환불·주문 조회부터 상품 추천까지 말씀만 해주세요 🐾',
  ],
  fallback: [
    '제가 잘 알아들을 수 있게 한 번만 더 말해주실래요? “배송”, “환불”, “주문 조회”, “상품 추천”처럼 적어주셔도 충분해요 :)',
    '음, 어떤 도움을 드리면 좋을까요? 🐾 주문 확인이나 상품 추천은 바로 도와드리고, 배송·환불·취소·반품은 담당자 연결까지 챙겨드릴게요.',
  ],
};

const intentAliases = {
  delivery: ['배송', '배숭', '베송', '배송', '택배', '운송장', '도착', '언제와', '출고', '배송조회'],
  refund: ['환불', '환블', '환뷸', '돈돌려', '환급', 'refund'],
  cancel: ['취소', '취소해', '주문취소', '취소할래', 'cancel'],
  return: ['반품', '반퓸', '반품해', '돌려보내', 'return'],
  exchange: ['교환', '교환해', '사이즈교환', '색상교환'],
  order: ['주문', '주뮨', '내주문', '주문조회', '주문번호', 'order'],
  product: ['추천', '뭐사', '피부', '사이즈', '코디', '상품', '화장품', '패션'],
  payment: ['결제', '결재', '카드', '페이', '구매', 'payment'],
  greeting: ['안녕', '하이', 'hello', '반가워', 'ㅎㅇ'],
};

const typoReplacements = {
  '배숭': '배송', '베송': '배송', '배송': '배송', '환블': '환불', '환뷸': '환불',
  '결재': '결제', '주뮨': '주문', '반퓸': '반품', '됬나요': '됐나요', '언제쯤': '언제',
};

const state = { cart: loadCart(), pendingHandoff: null };
const messagesEl = document.querySelector('#messages');
const inputEl = document.querySelector('#chat-input');
const productListEl = document.querySelector('#product-list');
const cartPanel = document.querySelector('#cart-panel');
const checkoutPanel = document.querySelector('#checkout-panel');

function money(value) {
  return `${value.toLocaleString('ko-KR')}원`;
}

function normalize(text) {
  let value = String(text || '').toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  Object.entries(typoReplacements).forEach(([wrong, right]) => { value = value.replaceAll(wrong, right); });
  return value;
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j < current.length; j += 1) prev[j] = current[j];
  }
  return prev[b.length];
}

function detectIntent(text) {
  const normalized = normalize(text);
  const scores = Object.fromEntries(Object.keys(intentAliases).map((key) => [key, 0]));
  Object.entries(intentAliases).forEach(([intent, aliases]) => {
    aliases.forEach((alias) => {
      const candidate = normalize(alias);
      if (normalized.includes(candidate)) scores[intent] = Math.max(scores[intent], candidate.length > 1 ? 3 : 1);
      const distance = levenshtein(normalized, candidate);
      if (normalized.length <= 9 && distance <= 1) scores[intent] = Math.max(scores[intent], 2);
    });
  });

  const [intent, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return score > 0 ? intent : 'fallback';
}

function chooseResponse(intent) {
  const options = responseBank[intent] || responseBank.fallback;
  return options[Math.floor(Math.random() * options.length)];
}

function addMessage(text, role = 'bot', options = {}) {
  const row = document.createElement('article');
  row.className = `message-row ${role === 'user' ? 'user-row' : 'bot-row'}`;
  const avatar = role === 'bot' ? `<div class="message-avatar"><img src="./public/assets/lincre-mascot.png" alt="" /></div>` : '';
  const handoff = options.handoff ? `<div class="handoff-card"><strong>담당자 연결 도와드릴게요</strong><span>주문번호를 남겨주시면 담당자가 이어서 확인해요. 상담 요청을 남겨볼까요?</span><button class="handoff-button" type="button" data-handoff="true">담당자 연결 요청</button></div>` : '';
  row.innerHTML = `${avatar}<div><div class="message-bubble ${role === 'user' ? 'user-bubble' : 'bot-bubble'}"><p>${escapeHtml(text)}</p>${handoff}</div><time>${role === 'user' ? '지금' : '방금 전'}</time></div>`;
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function sendUserMessage(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  addMessage(clean, 'user');
  inputEl.value = '';
  const intent = detectIntent(clean);
  const needsHandoff = ['delivery', 'refund', 'cancel', 'return', 'exchange'].includes(intent);
  window.setTimeout(() => addMessage(chooseResponse(intent), 'bot', { handoff: needsHandoff }), 420);
}

function renderProducts() {
  productListEl.innerHTML = products.map((product) => {
    const count = state.cart[product.id] || 0;
    return `<article class="product-item"><div class="product-art"><span aria-hidden="true">${product.emoji}</span></div><div class="product-meta"><strong title="${product.name}">${product.name}</strong><p>${product.detail}</p><div class="product-bottom"><span class="product-price">${money(product.price)}</span><button class="add-button" data-add="${product.id}" type="button" ${count ? 'disabled' : ''}>${count ? '담았어요 ✓' : '담기 +'}</button></div></div></article>`;
  }).join('');
}

function renderCart() {
  const entries = Object.entries(state.cart).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ product: products.find((item) => item.id === id), quantity })).filter((entry) => entry.product);
  const count = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const total = entries.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0);
  document.querySelector('#cart-count').textContent = count;
  document.querySelector('#cart-total').textContent = money(total);
  document.querySelector('#checkout-open').disabled = entries.length === 0;
  document.querySelector('#cart-items').innerHTML = entries.length ? entries.map(({ product, quantity }) => `<div class="cart-line"><div class="mini-art" aria-hidden="true">${product.emoji}</div><div><strong>${product.name}</strong><small>${money(product.price)}</small></div><div class="quantity-control"><button type="button" data-quantity="${product.id}" data-delta="-1" aria-label="${product.name} 수량 줄이기">−</button><span>${quantity}</span><button type="button" data-quantity="${product.id}" data-delta="1" aria-label="${product.name} 수량 늘리기">+</button></div></div>`).join('') : '<p class="cart-empty">아직 담은 상품이 없어요.<br />마음에 드는 아이템을 골라보세요 :)</p>';
  saveCart();
  renderProducts();
}

function changeCart(productId, delta) {
  state.cart[productId] = Math.max(0, (state.cart[productId] || 0) + delta);
  if (state.cart[productId] === 0) delete state.cart[productId];
  renderCart();
}

function togglePanel(panel, show) {
  panel.hidden = !show;
  if (show) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem('lincre-cart') || '{}'); } catch { return {}; }
}

function saveCart() {
  localStorage.setItem('lincre-cart', JSON.stringify(state.cart));
}

async function startRealPayment(payload) {
  // 실제 운영에서는 이 함수에서 내 서버의 결제 준비 API를 호출하세요.
  // 예: const response = await fetch('/api/payment/prepare', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  // PG사 secret key는 절대로 이 브라우저 코드에 넣지 않습니다.
  return { ok: true, demo: true, orderId: `LINCRE-${Date.now().toString().slice(-6)}` };
}

document.querySelector('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  sendUserMessage(inputEl.value);
});

document.querySelectorAll('[data-message]').forEach((button) => button.addEventListener('click', () => sendUserMessage(button.dataset.message)));
productListEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  changeCart(button.dataset.add, 1);
  togglePanel(cartPanel, true);
  document.querySelector('#cart-toggle').setAttribute('aria-expanded', 'true');
});
document.querySelector('#cart-items').addEventListener('click', (event) => {
  const button = event.target.closest('[data-quantity]');
  if (button) changeCart(button.dataset.quantity, Number(button.dataset.delta));
});
document.querySelector('#cart-toggle').addEventListener('click', () => {
  const next = cartPanel.hidden;
  togglePanel(cartPanel, next);
  document.querySelector('#cart-toggle').setAttribute('aria-expanded', String(next));
  if (next) togglePanel(checkoutPanel, false);
});
document.querySelector('#cart-close').addEventListener('click', () => {
  togglePanel(cartPanel, false);
  document.querySelector('#cart-toggle').setAttribute('aria-expanded', 'false');
});
document.querySelector('#checkout-open').addEventListener('click', () => {
  if (!document.querySelector('#checkout-open').disabled) togglePanel(checkoutPanel, true);
});
document.querySelector('#checkout-close').addEventListener('click', () => togglePanel(checkoutPanel, false));
messagesEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-handoff]');
  if (!button) return;
  button.disabled = true;
  button.textContent = '연결 요청을 남겼어요 ✓';
  addMessage('연결 요청 남겨두었어요. 담당자가 주문번호를 확인하고 이어서 안내드릴게요 🙏', 'bot');
});
document.querySelector('#checkout-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const result = await startRealPayment(Object.fromEntries(formData.entries()));
  if (result.ok) {
    addMessage(`주문 정보 확인했어요 💙 결제창 준비가 완료됐습니다. 데모 주문번호는 ${result.orderId}예요. 실제 운영에서는 이 지점에서 PG사 결제창을 열어주세요.`, 'bot');
    togglePanel(checkoutPanel, false);
  }
});

renderCart();
