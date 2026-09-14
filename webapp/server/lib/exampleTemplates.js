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
 const evidence=[product.description,...(product.features||[]),...(product.detailLines||[])].map(clean).filter(t=>! /추천상품|관련상품|다른상품/.test(t)).join(' ');
 const rules=category==='health'?
 [[/함량|성분|원료/,'원료와 함량'],[/섭취|복용|하루/,'섭취 방법'],[/주의|알레르기/,'주의사항'],[/캡슐|정제|젤리|분말/,'섭취 형태']]:
 [[/물걸레/,'물걸레 청소'],[/흡입|먼지/,'먼지 청소'],[/문턱|카펫/,'바닥 환경'],[/세척|자동.*비움/,'사용 후 관리'],[/배터리|충전/,'충전 방식'],[/소음/,'작동 소음'],[/크기|공간|cm/,'설치 공간']];
 const topics=rules.filter(([re])=>re.test(evidence)).map(([,topic])=>topic);
 if(!topics.length)topics.push(category==='health'?'섭취 전 확인':'사용 전 확인');
 const index=((Number(variant)||0)%10+10)%10;
 const prompts=[
 ['놓치고 있나요?','꼼꼼히 봤나요?','내게 맞을까요?','선택 전에 체크!','이제 비교해봐요'],
 ['먼저 따져봐요','차이를 살펴봐요','한 번 더 확인!','기준을 세워봐요','저장해 두세요'],
 ['무엇을 볼까요?','그냥 넘겼나요?','비교해 보셨나요?','핵심부터 봐요','확인하고 골라요'],
 ['궁금하지 않나요?','어떻게 다를까요?','조건부터 확인!','나에게 필요한가요?','결정 전에 봐요'],
 ['자세히 보세요','선택의 기준은?','이 부분 봤나요?','설명부터 읽어요','비교 목록에 쏙!'],
 ['고민되는 부분은?','어디까지 봤나요?','기준에 맞나요?','꼭 확인해봐요','다시 볼 땐 저장'],
 ['빼먹지 마세요','알고 고르세요','먼저 살펴봐요','차근차근 비교!','확인부터 해봐요'],
 ['15초만 살펴봐요','중요하게 보나요?','놓치기 쉬워요','조건과 맞춰봐요','체크하고 선택!'],
 ['생각해 보셨나요?','꼭 읽어볼 부분!','내 기준은 뭔가요?','이제 따져봐요','필요할 때 꺼내봐요'],
 ['비교할 준비됐나요?','어떤 점을 볼까요?','상세정보로 확인!','마지막으로 점검!','꼼꼼히 선택해요']
 ][index];
 const rows=prompts.map((line,i)=>[i===0?HOOK_SCRIPTS[index][0]:topics[(index+i)%topics.length],line]);
 return {purpose,scriptVariant:index,templateId:template.id,totalDuration:15,scenes:rows.map(([headline,sub],i)=>({key:template.id+'-'+i,start:template.cuts[i],end:template.cuts[i+1],duration:template.cuts[i+1]-template.cuts[i],headline,sub}))};
}
