// Confidence comes from independent product-specific signals, never the selected category.
const digital=/물걸레청소시스템|로봇청소|청소기|냉장고|세탁기|건조기|에어컨|공기청정기|가습기|제습기|전자레인지|전기밥솥|식기세척기|노트북|스마트폰|태블릿|모니터|텔레비전|이어폰|헤드폰|드라이기|전기면도기|선풍기|전기포트|보조배터리|스마트워치|블루투스스피커|전동칫솔|커피머신|인덕션|에어프라이어|안마기|마사지건|제빙기|\b(?:laptop|refrigerator|vacuum|earbuds)\b/i;
const health=/영양제|건강기능식품|유산균|프로바이오틱스|프리바이오틱스|비타민|오메가[3３]|멀티미네랄|루테인|밀크씨슬|글루코사민|포스파티딜세린|올레정|올리브오일|올리브유|레몬즙|콜라겐|collagen|홍삼|초유|락토페린|보스웰리아|콘드로이친|글루타치온|아르기닌|코엔자임|마그네슘|칼슘|철분|아연|멜라토닌|단백질보충|프로틴|크레아틴|차전자피|효소|\b(?:supplement|probiotics|multivitamin)\b/i;
// App health category also includes nutrition foods; this is not certification.
const nutritionFood=/애사비|애플사이다비니거|애플사이더비니거|사과초모식초|applecidervinegar|그래놀라|그라놀라|시리얼|씨리얼|단백질바|프로틴바|단백질쉐이크|단백질셰이크|고단백.{0,8}(?:간식|식품|음료|과자)|(?:granola|proteinbar|proteinshake)/i;
const additionalIngredient=/비오틴|엽산|판토텐산|셀레늄|셀렌|프로폴리스|베르베린|퀘르세틴|브로멜라인|가르시니아|카테킨|테아닌|트립토판|이노시톨|난소화성말토덱스트린|식이섬유|아스타잔틴|지아잔틴|포스트바이오틱스|신바이오틱스|MSM|쏘팔메토|로얄젤리/i;
const cosmetic=/마스크팩|크림|샴푸|트리트먼트|앰플|세럼|로션|토너|화장품|바디워시/;
const ingest=/섭취|복용|먹는|캡슐|정제|분말|젤리|구미|스틱|식품|하루.{0,8}[정포알]/;
const electric=/소비전력|정격전압|충전시간|배터리용량|흡입력|가전제품|전자제품/;
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
export function classifyCategory(product) {
  const title=norm(product.name);
  // Collagen cosmetics are not oral supplements.
  if(cosmetic.test(title)&&!ingest.test(title))return {category:null,confidence:'unknown',reason:'cosmetic-title'};
  const td=digital.test(title), th=health.test(title)||nutritionFood.test(title);
  if(td!==th)return {category:td?'digital':'health',confidence:'high',reason:'product-title'};
  if(td&&th)return {category:null,confidence:'unknown',reason:'conflicting-title'};
  const fields=[product.description,(product.features||[]).join(' '),(product.detailLines||[]).join(' '),product.categoryText];
  let ds=0,hs=0;
  for(const field of fields){const t=norm(field);if(!t)continue;if(digital.test(t))ds+=2;if(electric.test(t))ds++;if(health.test(t)||nutritionFood.test(t))hs+=2;if(ingest.test(t))hs++;}
  const evidence=norm([product.name,...fields].join(' '));
  if(!td && /hsy2|키성장원료|성장기.{0,8}영양/.test(evidence) && /섭취|복용|젤리|구미|캡슐|분말|\d+포|젤리스틱/.test(evidence) && ds===0){
    return {category:'health',confidence:'medium',reason:'growth-ingredient-and-ingestible-form'};
  }
  // Ingredient abbreviations need an oral-product signal, not a brand-only override.
  if(!td && ds===0 && /알파.?시클로덱스트린|알파.?사이클로덱스트린|(?:^|[^a-z])(?:a|α)[-‐‑–]?cd(?![a-z])/.test(evidence)
    && /섭취|복용|먹는|분말|식품|드링크|(?:디다)?샷|\bshot\b/.test(evidence)){
    return {category:'health',confidence:'medium',reason:'ingredient-and-oral-product'};
  }
  // A product-specific description is sufficient when it explicitly names the category.
  // Other ingredients need a separate oral-use signal, even across title/description/OCR.
  if(ds===0 && !cosmetic.test(evidence) && (
    /건강기능식품|영양보충제|식이보충제/.test(evidence) ||
    ((health.test(evidence)||nutritionFood.test(evidence)||additionalIngredient.test(evidence)) &&
      /섭취|복용|먹는|캡슐|정제|분말|젤리|구미|식품|하루.{0,8}[정포알]|한정당|\d+(?:정|포|캡슐)(?=[^가-힣]|입|분|$)/.test(evidence))
  ))return {category:'health',confidence:'medium',reason:'health-evidence-and-oral-use'};
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
