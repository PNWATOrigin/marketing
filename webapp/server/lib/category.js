// Product title is scoped to the item, unlike page-wide navigation or recommendations.
export function detectCategory(product) {
  const title=String(product.name||'').replace(/\s+/g,'');
  const digital=/청소기|냉장고|세탁기|건조기|에어컨|공기청정기|가습기|제습기|전자레인지|전기밥솥|식기세척기|노트북|스마트폰|태블릿|모니터|텔레비전|이어폰|헤드폰|드라이기|전기면도기|선풍기|전기포트/.test(title);
  const health=/영양제|건강기능식품|유산균|프로바이오틱스|비타민|오메가3|멀티미네랄|루테인|밀크씨슬|글루코사민|포스파티딜세린/.test(title);
  return digital===health ? null : digital?'digital':'health';
}
