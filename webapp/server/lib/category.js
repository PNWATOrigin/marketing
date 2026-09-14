// Confidence comes from independent product-specific signals, never the selected category.
const digital=/청소기|냉장고|세탁기|건조기|에어컨|공기청정기|가습기|제습기|전자레인지|전기밥솥|식기세척기|노트북|스마트폰|태블릿|모니터|텔레비전|이어폰|헤드폰|드라이기|전기면도기|선풍기|전기포트|보조배터리|스마트워치|블루투스스피커|전동칫솔|커피머신|인덕션|에어프라이어|안마기|마사지건|제빙기|\b(?:laptop|refrigerator|vacuum|earbuds)\b/i;
const health=/영양제|건강기능식품|유산균|프로바이오틱스|프리바이오틱스|비타민|오메가[3３]|멀티미네랄|루테인|밀크씨슬|글루코사민|포스파티딜세린|올레정|올리브오일|올리브유|레몬즙|콜라겐|collagen|홍삼|초유|락토페린|보스웰리아|콘드로이친|글루타치온|아르기닌|코엔자임|마그네슘|칼슘|철분|아연|멜라토닌|단백질보충|프로틴|크레아틴|차전자피|효소|\b(?:supplement|probiotics|multivitamin)\b/i;
const cosmetic=/마스크팩|크림|샴푸|트리트먼트|앰플|세럼|로션|토너|화장품|바디워시/;
const ingest=/섭취|복용|먹는|캡슐|정제|분말|젤리|구미|스틱|식품|하루.{0,8}[정포알]/;
const electric=/소비전력|정격전압|충전시간|배터리용량|흡입력|가전제품|전자제품/;
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
export function classifyCategory(product) {
  const title=norm(product.name);
  // Collagen cosmetics are not oral supplements.
  if(cosmetic.test(title)&&!ingest.test(title))return {category:null,confidence:'unknown',reason:'cosmetic-title'};
  const td=digital.test(title), th=health.test(title);
  if(td!==th)return {category:td?'digital':'health',confidence:'high',reason:'product-title'};
  if(td&&th)return {category:null,confidence:'unknown',reason:'conflicting-title'};
  const fields=[product.description,(product.features||[]).join(' '),(product.detailLines||[]).join(' '),product.categoryText];
  let ds=0,hs=0;
  for(const field of fields){const t=norm(field);if(!t)continue;if(digital.test(t))ds+=2;if(electric.test(t))ds++;if(health.test(t))hs+=2;if(ingest.test(t))hs++;}
  const category=ds>=3&&ds-hs>=3?'digital':hs>=3&&hs-ds>=3?'health':null;
  return {category,confidence:category?'medium':'unknown',reason:category?'product-description-and-ocr':'insufficient-or-conflicting',scores:{digital:ds,health:hs}};
}
export function detectCategory(product){return classifyCategory(product).category;}

export function categoryPatch(job) {
  const categoryDetection=classifyCategory(job.product||{});
  const detectedCategory=categoryDetection.category;
  const category=detectedCategory || job.category;
  return {category,requestedCategory:job.requestedCategory||job.category,product:{...job.product,categoryDetection,detectedCategory}};
}

export function categoryStartError(job) {
  const result=classifyCategory(job.product||{});
  if(!result.category)return '상품 카테고리를 확실하게 확인하지 못했어요. 광고·이벤트 링크 대신 상품명과 상세 설명이 있는 개별 상품 URL을 입력해주세요.';
  return null;
}
