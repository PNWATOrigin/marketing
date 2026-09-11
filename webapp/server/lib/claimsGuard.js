// 건강기능식품·화장품·의료 관련 상품에서 흔히 문제가 되는, 검증되지 않은 과장 표현을
// 걸러낸다. 이 앱은 AI로 문구를 새로 만들지 않고 상세페이지 텍스트/OCR 결과를 그대로
// 가져오는 구조라, 원본 페이지에 이런 표현이 있으면 그대로 캡션에 노출될 수 있어
// 여기 걸리면 해당 줄만 제외한다(정보를 지어내지 않는다는 원칙과 동일하게, 고쳐 쓰지
// 않고 그냥 버린다).
const BANNED_CLAIM_PATTERNS = [
  /완치/, /치료/, /치유/, /무조건/, /100\s*%\s*효과/, /100\s*퍼센트\s*효과/,
  /부작용\s*없/, /즉시\s*효과/, /효과\s*보장/, /의학적으로\s*(입증|증명)/,
  /전액\s*환불\s*보장/,
];

export function hasBannedClaim(text) {
  return BANNED_CLAIM_PATTERNS.some((re) => re.test(text));
}

// 배열에서 과장 표현이 포함된 항목만 제외하고, 몇 개를 걸러냈는지 함께 돌려준다.
// 호출 쪽은 이 개수로 사용자에게 검수 경고를 남길 수 있다.
export function filterBannedClaims(items) {
  const kept = [];
  let removed = 0;
  for (const item of items) {
    if (hasBannedClaim(item)) removed += 1;
    else kept.push(item);
  }
  return { kept, removed };
}
