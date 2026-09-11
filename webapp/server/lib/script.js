export const PURPOSES = {
 views: {id:'views',label:'조회수 확보형',metrics:['공감 HOOK','궁금증','공유 유도']},
 sales: {id:'sales',label:'판매 전환형',metrics:['불편 해결','상품 구성','구매 행동']},
 brand: {id:'brand',label:'브랜드 인지도형',metrics:['생활 공감','브랜드 각인','기억 유도']},
};
const short=(text,n=26)=>String(text||'').replace(/\s+/g,' ').trim().slice(0,n);
// 건강기능식품 판매전환형 전용 나레이션 20종 - 공감형 후킹 문구 + [제품] 자리표시자.
// 상품마다(이름 기준) 하나를 골라 [제품]을 실제 상품명으로 채워 넣는다.
const HEALTH_SALES_SCRIPTS=[
 {hook:'요즘 왜 이렇게 챙겨 먹는 게 많지?',line1:'하나하나 따로 챙기기 귀찮아서 시작한 [제품].',line2:'매일 간편하게 챙길 수 있으니까 생각보다 오래 먹게 되더라고요.'},
 {hook:'건강은 챙기고 싶은데, 뭘 먹어야 할지 모르겠다면?',line1:'저도 그래서 이것저것 비교해보다가 [제품]으로 정착했어요.',line2:'매일 부담 없이 챙기기 좋은 게 제일 마음에 들었어요.'},
 {hook:'이거 하나는 매일 챙겨 먹게 되더라고요.',line1:'바쁜 날에도 간편하게 챙길 수 있는 [제품].',line2:'거창하게 시작하기보다 매일 꾸준히 챙기는 것부터 시작해보세요.'},
 {hook:'나만 빼고 다들 뭔가 챙겨 먹는 것 같다면?',line1:'저도 처음엔 뭘 골라야 할지 몰랐는데,',line2:'간편하게 챙길 수 있는 [제품]부터 시작했어요.'},
 {hook:'작심삼일로 끝나는 건강관리는 이제 그만.',line1:'복잡하면 결국 안 하게 되잖아요.',line2:'그래서 저는 간편하게 챙길 수 있는 [제품]으로 루틴을 만들었어요.'},
 {hook:'매일 바쁜데 건강까지 어떻게 챙기냐고요?',line1:'저도 그렇게 생각했는데,',line2:'하루 한 번 간편하게 챙기는 [제품]부터 시작하니까 훨씬 편했어요.'},
 {hook:'건강을 위해 뭔가 시작하고 싶다면, 어렵게 생각하지 마세요.',line1:'매일 꾸준히 챙기는 작은 습관부터.',line2:'제가 선택한 건 바로 [제품]이에요.'},
 {hook:'좋다는 건 많은데, 결국 중요한 건 꾸준히 먹는 거더라고요.',line1:'그래서 맛과 섭취 편의성까지 따져본 [제품].',line2:'매일 챙기는 습관을 만들고 싶다면 한 번 살펴보세요.'},
 {hook:'솔직히 건강식품, 귀찮으면 손이 안 가잖아요.',line1:'저도 그래서 간편함을 가장 중요하게 봤어요.',line2:'부담 없이 매일 챙기기 좋은 [제품]을 찾았다면 주목해보세요.'},
 {hook:'아침마다 이것저것 챙기는 사람이라면?',line1:'복잡한 루틴 대신 간편하게 챙기는 [제품].',line2:'바쁜 일상 속에서도 건강한 습관을 이어가고 싶어서 선택했어요.'},
 {hook:'요즘 제가 매일 빼놓지 않는 것.',line1:'바로 [제품]이에요.',line2:'꾸준히 챙길 수 있는 제품을 찾다가 선택했는데, 일상 루틴으로 만들기 좋더라고요.'},
 {hook:'건강관리는 거창하게 시작할 필요 없더라고요.',line1:'매일 하나씩 꾸준히 챙기는 것부터.',line2:'저는 [제품]으로 간단하게 시작해봤어요.'},
 {hook:'뭘 먹어야 할지 몰라서 계속 미루고 있었다면?',line1:'저처럼 성분과 섭취 방법을 꼼꼼히 비교해보고',line2:'내 루틴에 맞는 [제품]부터 시작해보세요.'},
 {hook:'한 번 먹고 끝나는 것보다 매일 챙길 수 있는 게 중요하잖아요.',line1:'그래서 선택한 [제품].',line2:'바쁜 날에도 간편하게 챙길 수 있어서 자연스럽게 루틴이 됐어요.'},
 {hook:'요즘 건강 챙기기 시작한 사람들, 이것부터 보세요.',line1:'매일 부담 없이 챙길 수 있는 [제품].',line2:'복잡한 관리보다 꾸준한 습관을 만들고 싶은 분께 추천해요.'},
 {hook:'저는 건강식품 고를 때 이것부터 봐요.',line1:'성분, 섭취 편의성, 그리고 꾸준히 먹을 수 있는지.',line2:'그 기준으로 골라본 게 바로 [제품]이에요.'},
 {hook:'매번 사놓고 안 먹는 건강식품, 이제 그만.',line1:'눈에 잘 보이고 간편하게 챙길 수 있어야 꾸준히 먹게 되더라고요.',line2:'그래서 저는 [제품]을 선택했어요.'},
 {hook:'건강을 챙기고 싶지만 귀찮은 사람이라면?',line1:'저도 똑같았어요.',line2:'그래서 복잡한 방법 대신 매일 간편하게 챙길 수 있는 [제품]으로 시작했어요.'},
 {hook:'꾸준히 챙겨 먹을 건강식품을 찾고 있다면?',line1:'무조건 유명한 제품보다 내 생활 패턴에 잘 맞고 꾸준히 섭취할 수 있는지 먼저 확인해보세요.',line2:'저는 [제품]이 잘 맞았어요.'},
 {hook:'요즘 제 주변에서 뭐 먹냐고 물어보길래…',line1:'제가 매일 챙기고 있는 건 [제품]이에요.',line2:'건강관리를 어렵게 생각했던 분이라면, 간단한 습관부터 시작해보세요.'},
];
// 상품명 기준으로 20종 중 하나를 고정 선택한다(같은 상품이면 항상 같은 톤, 상품마다는 다양하게).
function pickHealthScript(name){
 let h=0; for(const ch of String(name)) h=(h*31+ch.charCodeAt(0))>>>0;
 return HEALTH_SALES_SCRIPTS[h%HEALTH_SALES_SCRIPTS.length];
}
// No model calls. Claims come only from extracted product fields.
export function generateScript(product,purposeId,category='auto') {
 if(!PURPOSES[purposeId]) throw new Error('알 수 없는 목적입니다.');
 const name=short(product.name||'이 상품');
 const brand=short(product.brand||product.name||'이 상품',20);
 const features=(product.features||[]).filter(Boolean);
 const feature=short(features[0]||name), next=short(features[1]||'상품 구성을 확인해 보세요');
 const point3=short(features[2]||feature);
 const point4=short(features[3]||next);
 if(category==='health'&&purposeId==='sales'){
  const t=pickHealthScript(product.name||name);
  const fill=(s)=>short(s.replace('[제품]',name),48);
  const healthLines=[[fill(t.hook),null],[fill(t.line1),null],[fill(t.line2),null],[name,feature],['지금 확인해보세요',brand]];
  return {purpose:purposeId,totalDuration:15,scenes:healthLines.map(([headline,sub],i)=>({key:['hook','problem','benefit','brand','cta'][i],start:i*3,end:(i+1)*3,duration:3,headline,sub}))};
 }
 const vacuum=/청소기/.test(product.name||'')&&/자동\s*먼지\s*비움/.test([product.name,...features].join(' '));
 const lines=vacuum?{
 views:[['청소 끝났는데…','먼지통 비우기가 남았네?'],['청소보다 이게','더 귀찮았던 사람?'],['이제 먼지 비움까지','자동으로!'],[brand,'자동먼지비움 청소기'],['그 친구 생각났죠?','지금 공유해 주세요']],
 sales:[['먼지통 비우기','아직도 직접 하세요?'],['귀찮은 마무리,','자동으로 바꾸세요'],[feature,next],[brand,'자동먼지비움 무선청소기'],['상품 구성과 혜택','지금 확인하세요']],
 brand:[['청소가 끝나면,','진짜 쉬어야 하니까'],['번거로운 일','하나 줄이고'],['먼지 비움까지','생각한 무선청소기'],['청소의 마무리까지',brand],['다음 청소기를 떠올릴 때',brand]],
 }:{
 views:[['이런 상품 찾고 있었어요?',name],['내 취향인지','딱 15초만 확인해요'],[feature,next],['눈여겨볼 포인트',point3],['이거 좋아할 친구에게','지금 공유해 주세요']],
 sales:[['사기 전에','이 구성부터 확인하세요'],[name,feature],['내게 필요한 포인트',next],[brand,point3],['상품 구성과 혜택','지금 확인하세요']],
 brand:[['일상에 들이고 싶은 선택',brand],[name,'내 취향에 가까운 발견'],[feature,next],['다음 선택이 필요한 순간',point4],['기억하세요',brand]],
 };
 return {purpose:purposeId,totalDuration:15,scenes:lines[purposeId].map(([headline,sub],i)=>({key:['hook','problem','benefit','brand','cta'][i],start:i*3,end:(i+1)*3,duration:3,headline,sub}))};
}
