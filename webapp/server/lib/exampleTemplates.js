import {filterBannedClaims} from './claimsGuard.js';
export const EXAMPLE_TEMPLATES={
 views:{id:'example-1',captionY:760,fontSize:72,fontColor:'0x58352D',borderColor:'0x58352D',borderWidth:0,boxColor:'0xF7C7DC',closingColor:'0xFFF2CE',cuts:[0,2,5,8,12,15],preferred:['DETAIL','PRODUCT_HERO','CLOSEUP']},
 sales:{id:'example-2',captionY:1000,fontSize:80,fontColor:'white',borderColor:'0x28202A',borderWidth:5,closingColor:'0xFF90CC',cuts:[0,2,4,8,12,15],preferred:['USAGE','CLOSEUP','PRODUCT_HERO']},
 brand:{id:'example-3',captionY:330,fontSize:78,fontColor:'0xFFF0D9',borderColor:'0x653C31',borderWidth:6,closingColor:'0xFFF0D9',cuts:[0,2,4,8,12,15],preferred:['DETAIL','CLOSEUP','LIFESTYLE']}
};
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
export function generateExampleScript(product,purpose,category){
 const template=EXAMPLE_TEMPLATES[purpose];if(!template)throw new Error('콘텐츠 예시를 선택해주세요.');
 const name=category==='health'?'영양제':clean(product.name).slice(0,28)||'이 상품';
 const raw=product.detailOnly?(product.detailLines||[]):[...(product.features||[]),...(product.detailLines||[])];
 const facts=[...new Set(filterBannedClaims(raw.map(clean).filter(Boolean)).kept)].filter(t=>!(/배송|고객센터|무이자|카드혜택|교환|반품/.test(t))).slice(0,8);
 if(product.detailOnly&&facts.length<2)throw new Error('상세 이미지에서 읽을 수 있는 문구가 부족해요.');
 const one=facts[0]||'상품의 구성부터 확인해요',two=facts[1]||'사용 방법도 함께 확인해요';
 const rows=purpose==='views'?
 [['이 상품, 눈여겨봐요',name],['첫 번째 체크 포인트',one],['다음으로 볼 포인트',two],['구성까지 꼼꼼하게',facts[2]||name],['저장하고 비교해봐요',clean(product.brand)||name]]:
 purpose==='sales'?
 [['이건 어떻게 쓸까요?',name],['자세히 살펴보면',one],['이런 점을 확인해요',two],['사용 전 이것까지',facts[2]||'상세페이지에서 확인해요'],['구성까지 확인해봐요',clean(product.brand)||name]]:
 [['구매 전 확인할 2가지',name],['이유부터 살펴보면','선택 기준이 보여요'],['첫 번째, 이 부분',one],['두 번째는 이것',two],['두 가지 비교하고','내게 맞게 선택해요']];
 return {purpose,templateId:template.id,totalDuration:15,scenes:rows.map(([headline,sub],i)=>({key:template.id+'-'+i,start:template.cuts[i],end:template.cuts[i+1],duration:template.cuts[i+1]-template.cuts[i],headline,sub}))};
}
