export const EXAMPLE_TEMPLATES={
 views:{id:'example-1',captionY:760,fontSize:72,fontColor:'0x58352D',borderColor:'0x58352D',borderWidth:0,boxColor:'0xF7C7DC',closingColor:'0xFFF2CE',cuts:[0,3,6,9,12,15],preferred:['DETAIL','PRODUCT_HERO','CLOSEUP']},
 sales:{id:'example-2',captionY:1000,fontSize:80,fontColor:'white',borderColor:'0x28202A',borderWidth:5,closingColor:'0xFF90CC',cuts:[0,3,6,9,12,15],preferred:['USAGE','CLOSEUP','PRODUCT_HERO']},
 brand:{id:'example-3',captionY:330,fontSize:78,fontColor:'0xFFF0D9',borderColor:'0x653C31',borderWidth:6,closingColor:'0xFFF0D9',cuts:[0,3,6,9,12,15],preferred:['DETAIL','CLOSEUP','LIFESTYLE']}
};
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
// Purchase motivation uses verified product features, without invented popularity or efficacy.
export const HOOK_SCRIPTS = [
 ['잠깐, 사기 전에!'],['가격만 보셨죠?'],['사놓고 안 쓰면?'],['장바구니 넣기 전'],['이왕 살 거라면'],
 ['고민 중이라면?'],['매일 쓸 거니까'],['이건 보셨어요?'],['고르기 어렵죠?'],['후회하기 싫다면']
];
const PURCHASE_POINTS = {
 digital:[
  [/물걸레/, '바닥 닦기 귀찮죠?', '물걸레 기능까지', '바닥 관리가 고민이라면'],
  [/흡입|먼지/, '또 먼지가 보여요?', '흡입 기능을 봐요.', '먼지 청소가 필요할 때'],
  [/문턱.*넘|문턱.*통과/, '문턱이 고민이죠?', '통과 높이를 봐요.', '집 바닥 조건에 맞춰'],
  [/자동.{0,8}세척|스마트.{0,8}세척/, '걸레 빨기 귀찮죠?', '자동 세척까지', '관리 수고를 덜고 싶다면'],
  [/자동.{0,8}먼지.{0,8}비움|자동.{0,8}비움/, '먼지통 비우기도', '자동 비움으로', '청소 후 관리까지 생각해요'],
  [/무선/, '선이 걸리적대죠?', '무선으로 편하게', '선 없는 사용을 원할 때'],
  [/접이식|접을 수/, '보관이 고민이죠?', '접어서 보관해요.', '수납 방식까지 생각해요']
 ],
 health:[
  [/하루\s*(?:한|1)\s*(?:번|회)/, '매일 챙기기엔?', '하루 한 번으로', '내 생활에 맞는 루틴으로'],
  [/개별\s*포장/, '밖에서도 간편히', '개별 포장이에요.', '외출할 때도 챙겨봐요'],
  [/젤리|구미/, '알약이 싫다면?', '씹어 먹는 타입', '내가 선호하는 방식으로'],
  [/분말/, '분말을 찾는다면', '분말 타입이에요.', '섭취 방식부터 내 취향으로'],
  [/캡슐/, '캡슐을 찾는다면', '캡슐 타입이에요.', '내 루틴에 맞춰 선택해요'],
  [/원료|성분|함량/, '성분부터 봐요.', '함량도 확인해요.', '나에게 필요한 기준으로']
 ]
};
export function generateExampleScript(product,purpose,category,variant=0){
 const template=EXAMPLE_TEMPLATES[purpose];if(!template)throw new Error('콘텐츠 예시를 선택해주세요.');
 const evidence=[product.description,...(product.features||[]),...(product.detailLines||[])].map(clean).filter(t=>! /추천상품|관련상품|다른상품/.test(t)).join(' ');
 const points=PURCHASE_POINTS[category==='health'?'health':'digital'].filter(([re])=>re.test(evidence));
 const index=((Number(variant)||0)%10+10)%10;
 const available=points.length?points:[[null,'구성부터 볼까요?',category==='health'?'섭취 안내부터':'상세 사양부터','나에게 맞는 구성으로']];
 const first=available[index%available.length],second=available[(index+1)%available.length];
 const rows=[
 [HOOK_SCRIPTS[index][0],'이건 꼭 보세요.'],
 [first[1],first[2]],
 [points.length>1?'이것도 보세요.':'내가 쓸 때는?',points.length>1?second[2]:category==='health'?'섭취 방법도 봐요.':'둘 공간도 봐요.'],
 [category==='health'?'매일 챙길 거니까':'자주 쓸 거니까','내게 맞아야죠.'],
 [['찾던 조건이면','마음에 든다면','필요했던 거라면','내게 딱 맞다면','고민이 풀렸다면'][index%5],'지금 확인해요.']
 ];
 return {purpose,scriptVariant:index,templateId:template.id,totalDuration:15,scenes:rows.map(([headline,sub],i)=>({key:template.id+'-'+i,start:template.cuts[i],end:template.cuts[i+1],duration:template.cuts[i+1]-template.cuts[i],headline,sub}))};
}
