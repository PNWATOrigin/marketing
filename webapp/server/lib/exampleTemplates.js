export const EXAMPLE_TEMPLATES={
 views:{id:'example-1',captionY:760,fontSize:72,fontColor:'0x58352D',borderColor:'0x58352D',borderWidth:0,boxColor:'0xF7C7DC',closingColor:'0xFFF2CE',cuts:[0,2,5,8,12,15],preferred:['DETAIL','PRODUCT_HERO','CLOSEUP']},
 sales:{id:'example-2',captionY:1000,fontSize:80,fontColor:'white',borderColor:'0x28202A',borderWidth:5,closingColor:'0xFF90CC',cuts:[0,2,4,8,12,15],preferred:['USAGE','CLOSEUP','PRODUCT_HERO']},
 brand:{id:'example-3',captionY:330,fontSize:78,fontColor:'0xFFF0D9',borderColor:'0x653C31',borderWidth:6,closingColor:'0xFFF0D9',cuts:[0,2,4,8,12,15],preferred:['DETAIL','CLOSEUP','LIFESTYLE']}
};
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
// Purchase motivation uses verified product features, without invented popularity or efficacy.
export const HOOK_SCRIPTS = [
 ['이런 게 필요했다면'],['매일 신경 쓰였다면'],['딱 내 얘기라면'],['이 장면, 익숙하죠?'],['그냥 넘기기 아까워요'],
 ['찾던 기준이 있다면'],['이 부분이 고민이라면'],['내 일상에 필요한 건'],['눈여겨볼 이유가 있어요'],['다음 선택은 달라지게']
];
const PURCHASE_POINTS = {
 digital:[
  [/물걸레/, '바닥 닦기 번거롭죠?', '물걸레 청소 기능', '바닥 관리가 고민이라면'],
  [/흡입|먼지/, '먼지가 자꾸 보이죠?', '흡입 청소 기능', '먼지 청소가 필요할 때'],
  [/문턱.*넘|문턱.*통과/, '문턱이 걸렸다면', '문턱 통과 기능', '집 바닥 조건에 맞춰'],
  [/자동.{0,8}세척|스마트.{0,8}세척/, '걸레 빨기 번거롭죠?', '자동 세척 기능', '관리 수고를 덜고 싶다면'],
  [/자동.{0,8}먼지.{0,8}비움|자동.{0,8}비움/, '먼지통 비우기 귀찮죠?', '자동 비움 기능', '청소 후 관리까지 생각해요'],
  [/무선/, '선이 걸리적거렸다면', '무선으로 사용하는 방식', '선 없는 사용을 원할 때'],
  [/접이식|접을 수/, '보관 공간이 고민이죠?', '접어서 보관하는 구조', '수납 방식까지 생각해요']
 ],
 health:[
  [/하루\s*(?:한|1)\s*(?:번|회)/, '루틴이 복잡했다면', '하루 한 번 섭취 안내', '내 생활에 맞는 루틴으로'],
  [/개별\s*포장/, '챙겨 다니고 싶다면', '개별 포장 구성', '외출할 때도 챙겨봐요'],
  [/젤리|구미/, '섭취 형태도 중요하죠?', '씹어 먹는 형태', '내가 선호하는 방식으로'],
  [/분말/, '분말 형태를 찾았다면', '분말형 구성', '섭취 방식부터 내 취향으로'],
  [/캡슐/, '캡슐형을 찾고 있나요?', '캡슐 형태로 구성', '내 루틴에 맞춰 선택해요'],
  [/원료|성분|함량/, '내용을 보고 고른다면', '원료와 함량부터', '나에게 필요한 기준으로']
 ]
};
export function generateExampleScript(product,purpose,category,variant=0){
 const template=EXAMPLE_TEMPLATES[purpose];if(!template)throw new Error('콘텐츠 예시를 선택해주세요.');
 const evidence=[product.description,...(product.features||[]),...(product.detailLines||[])].map(clean).filter(t=>! /추천상품|관련상품|다른상품/.test(t)).join(' ');
 const points=PURCHASE_POINTS[category==='health'?'health':'digital'].filter(([re])=>re.test(evidence));
 const index=((Number(variant)||0)%10+10)%10;
 const available=points.length?points:[[null,'내 기준이 분명하다면',category==='health'?'섭취 안내를 읽고':'상세 사양을 읽고','나에게 맞는 구성으로']];
 const first=available[index%available.length],second=available[(index+1)%available.length];
 const bridges=['고를 이유는 여기','내가 찾던 포인트','이런 점을 원했다면','일상에 맞춰 골라요','선택 기준이 보이죠?','필요했던 부분부터','내 취향에 맞는 선택','쓸 때를 생각해보세요','이 기준으로 골라요','내 생활을 떠올려봐요'];
 const closes=['마음에 들었다면','내게 필요한 구성이라면','찾던 조건에 맞는다면','이런 선택을 원했다면','내 기준에 맞았다면','이 구성이 끌린다면','일상에 맞는다면','필요한 기능이라면','원하던 방식이라면','내 취향이었다면'];
 const actions=['구매 옵션을 살펴봐요','원하는 구성을 골라요','상세페이지에서 만나봐요','지금 구성 보러 가요','상품 옵션을 골라봐요','내게 맞는 옵션으로','장바구니에 담아봐요','구매 페이지로 가봐요','원하는 옵션을 찾아요','상세 구성 보러 가요'];
 const rows=[
 [HOOK_SCRIPTS[index][0],first[1]],
 [first[2],first[3]],
 [bridges[index],points.length>1?second[2]:category==='health'?'섭취 방법도 내 기준으로':'사용 환경도 내 기준으로'],
 [points.length>1?second[3]:'내게 맞는지 살펴보고',closes[index]],
 [actions[index],category==='health'?'내 루틴에 맞춰 골라요':'내 일상에 맞춰 골라요']
 ];
 return {purpose,scriptVariant:index,templateId:template.id,totalDuration:15,scenes:rows.map(([headline,sub],i)=>({key:template.id+'-'+i,start:template.cuts[i],end:template.cuts[i+1],duration:template.cuts[i+1]-template.cuts[i],headline,sub}))};
}
