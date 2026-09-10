export const PURPOSES = {
 views: {id:'views',label:'조회수 확보형',metrics:['공감 HOOK','궁금증','공유 유도']},
 sales: {id:'sales',label:'판매 전환형',metrics:['불편 해결','상품 구성','구매 행동']},
 brand: {id:'brand',label:'브랜드 인지도형',metrics:['생활 공감','브랜드 각인','기억 유도']},
};
const short=(text,n=26)=>String(text||'').replace(/\s+/g,' ').trim().slice(0,n);
// No model calls. Claims come only from extracted product fields.
export function generateScript(product,purposeId) {
 if(!PURPOSES[purposeId]) throw new Error('알 수 없는 목적입니다.');
 const name=short(product.name||'이 상품');
 const brand=short(product.brand||product.name||'이 상품',20);
 const features=(product.features||[]).filter(Boolean);
 const feature=short(features[0]||name), next=short(features[1]||'상품 구성을 확인해 보세요');
 const point3=short(features[2]||feature);
 const point4=short(features[3]||next);
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
