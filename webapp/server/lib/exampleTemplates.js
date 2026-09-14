import {simplifyCaptionProduct,captionProductName} from './captionText.js';
import {filterBannedClaims} from './claimsGuard.js';
export const EXAMPLE_TEMPLATES={
 views:{id:'example-1',captionY:760,fontSize:72,fontColor:'0x58352D',borderColor:'0x58352D',borderWidth:0,boxColor:'0xF7C7DC',closingColor:'0xFFF2CE',cuts:[0,2,5,8,12,15],preferred:['DETAIL','PRODUCT_HERO','CLOSEUP']},
 sales:{id:'example-2',captionY:1000,fontSize:80,fontColor:'white',borderColor:'0x28202A',borderWidth:5,closingColor:'0xFF90CC',cuts:[0,2,4,8,12,15],preferred:['USAGE','CLOSEUP','PRODUCT_HERO']},
 brand:{id:'example-3',captionY:330,fontSize:78,fontColor:'0xFFF0D9',borderColor:'0x653C31',borderWidth:6,closingColor:'0xFFF0D9',cuts:[0,2,4,8,12,15],preferred:['DETAIL','CLOSEUP','LIFESTYLE']}
};
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
// Questions invite comparison; they do not invent efficacy, discounts or popularity.
export const HOOK_SCRIPTS = [
 ['잠깐, 사기 전에!', '이것부터 확인해요', '다음은 이 부분', '내 기준과 비교해요', '저장하고 비교해요'],
 ['이름만 보고 고르나요?', '이름보다 중요한 건', '이 차이도 살펴봐요', '선택 전에 한 번 더', '상세정보 확인해요'],
 ['가격만 보고 샀다면?', '가격 말고 볼 것은', '놓치기 쉬운 부분', '내게 필요한지 체크', '비교한 뒤 선택해요'],
 ['장바구니 넣기 전!', '먼저 살펴볼 정보', '이 부분도 체크해요', '구성까지 확인해요', '확인하고 담아봐요'],
 ['광고보다 볼 것은?', '상품 정보부터 봐요', '설명 속 핵심은', '내 기준에 맞나요?', '핵심만 저장해요'],
 ['선택이 고민된다면?', '첫 기준은 이것', '다음 기준도 확인', '필요한 점과 비교', '꼼꼼히 골라봐요'],
 ['그냥 넘기지 마세요', '눈여겨볼 상품 정보', '여기도 살펴보세요', '내게 맞는지 확인', '다시 볼 땐 저장'],
 ['사기 전 15초만!', '먼저 확인할 내용', '이 정보도 중요해요', '마지막으로 체크', '확인 후 선택해요'],
 ['겉모습만 보셨나요?', '설명도 확인해요', '자세히 보면 이 부분', '선택 기준을 세워요', '상세페이지에서 봐요'],
 ['비교 없이 고르나요?', '비교할 첫 포인트', '함께 볼 상품 정보', '내 조건과 맞춰봐요', '비교 목록에 저장']
];
export function generateExampleScript(product,purpose,category,variant=0){
 const template=EXAMPLE_TEMPLATES[purpose];if(!template)throw new Error('콘텐츠 예시를 선택해주세요.');
 const name=captionProductName(product,category);
 const raw=product.detailOnly?(product.detailLines||[]):[...(product.features||[]),...(product.detailLines||[])];
 const facts=[...new Set(filterBannedClaims(raw.map(clean).filter(Boolean)).kept)]
  .filter(t=>!(/배송|고객센터|무이자|카드혜택|교환|반품|로그인|copyright|https?:|쿠폰|개인정보|사업자|장바구니/i.test(t)))
  .map(t=>simplifyCaptionProduct(t,product,category))
  .filter(t=>t.length>=4&&[...t].length<=28&&/[가-힣a-z]/i.test(t)&&!/[{}<>]/.test(t)).slice(0,10);
 // Keep short, complete source phrases. Never clip an OCR sentence mid-word.
 const checks=category==='health'?['원료와 함량을 확인해요','섭취 방법을 확인해요','주의사항도 읽어보세요']:['기능과 사양을 확인해요','사용 환경을 확인해요','구성품도 살펴보세요'];
 const index=((Number(variant)||0)%10+10)%10;
 const copy=HOOK_SCRIPTS[index];
 const ordered=facts.length?facts.slice(index%facts.length).concat(facts.slice(0,index%facts.length)):[];
 const rows=copy.map((line,i)=>[line,i===0?name:i===4?(purpose==='sales'?'구매 전 상세정보 확인':purpose==='brand'?clean(product.brand)||name:'필요할 때 다시 봐요'):ordered[i-1]||checks[i-1]]);
 return {purpose,scriptVariant:index,templateId:template.id,totalDuration:15,scenes:rows.map(([headline,sub],i)=>({key:template.id+'-'+i,start:template.cuts[i],end:template.cuts[i+1],duration:template.cuts[i+1]-template.cuts[i],headline:simplifyCaptionProduct(headline,product,category),sub:simplifyCaptionProduct(sub,product,category)}))};
}
