export const EXAMPLE_TEMPLATES={
 views:{id:'example-1',captionY:760,fontSize:72,fontColor:'0x58352D',borderColor:'0x58352D',borderWidth:0,boxColor:'0xF7C7DC',closingColor:'0xFFF2CE',cuts:[0,2,5,8,12,15],preferred:['DETAIL','PRODUCT_HERO','CLOSEUP']},
 sales:{id:'example-2',captionY:1000,fontSize:80,fontColor:'white',borderColor:'0x28202A',borderWidth:5,closingColor:'0xFF90CC',cuts:[0,2,4,8,12,15],preferred:['USAGE','CLOSEUP','PRODUCT_HERO']},
 brand:{id:'example-3',captionY:330,fontSize:78,fontColor:'0xFFF0D9',borderColor:'0x653C31',borderWidth:6,closingColor:'0xFFF0D9',cuts:[0,2,4,8,12,15],preferred:['DETAIL','CLOSEUP','LIFESTYLE']}
};
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
// Purchase motivation uses verified product features, without invented popularity or efficacy.
export const HOOK_SCRIPTS = [
 ['살 때 이것부터 봐요.'],['가격만 보고 고르세요?'],['사놓고 안 쓰면 아깝죠.'],['고르기 전에 잠깐만요.'],['나한테 맞는 게 중요하죠.'],
 ['비교할 땐 여길 보세요.'],['매일 쓸 걸 생각해 봐요.'],['이 조건, 확인하셨나요?'],['고민된다면 여기부터요.'],['후회 없이 고르고 싶죠?']
];
const PURCHASE_POINTS = {
 digital:[
  [/물걸레/, '바닥 닦기 번거롭죠?', '물걸레 청소도 돼요.', '바닥 관리가 고민이라면'],
  [/흡입|먼지/, '먼지가 자꾸 보이죠?', '흡입 기능을 확인해요.', '먼지 청소가 필요할 때'],
  [/문턱.*넘|문턱.*통과/, '문턱 때문에 고민이세요?', '넘을 수 있는 높이를 봐요.', '집 바닥 조건에 맞춰'],
  [/자동.{0,8}세척|스마트.{0,8}세척/, '걸레 빨기 번거롭죠?', '자동 세척을 지원해요.', '관리 수고를 덜고 싶다면'],
  [/자동.{0,8}먼지.{0,8}비움|자동.{0,8}비움/, '먼지통 비우기 귀찮죠?', '자동 비움을 지원해요.', '청소 후 관리까지 생각해요'],
  [/무선/, '선이 걸리적거리죠?', '무선으로 사용할 수 있어요.', '선 없는 사용을 원할 때'],
  [/접이식|접을 수/, '보관 공간이 고민이죠?', '접어서 보관할 수 있어요.', '수납 방식까지 생각해요']
 ],
 health:[
  [/하루\s*(?:한|1)\s*(?:번|회)/, '매일 챙기기 번거롭죠?', '하루 한 번 챙기는 방식이에요.', '내 생활에 맞는 루틴으로'],
  [/개별\s*포장/, '밖에서도 챙기고 싶죠?', '하나씩 따로 포장돼 있어요.', '외출할 때도 챙겨봐요'],
  [/젤리|구미/, '섭취 형태도 중요하죠?', '씹어 먹는 형태예요.', '내가 선호하는 방식으로'],
  [/분말/, '분말 타입을 찾으세요?', '분말 형태로 나와요.', '섭취 방식부터 내 취향으로'],
  [/캡슐/, '캡슐형을 찾고 있나요?', '캡슐 형태로 나와요.', '내 루틴에 맞춰 선택해요'],
  [/원료|성분|함량/, '성분부터 살펴보세요.', '원료와 함량을 확인해요.', '나에게 필요한 기준으로']
 ]
};
export function generateExampleScript(product,purpose,category,variant=0){
 const template=EXAMPLE_TEMPLATES[purpose];if(!template)throw new Error('콘텐츠 예시를 선택해주세요.');
 const evidence=[product.description,...(product.features||[]),...(product.detailLines||[])].map(clean).filter(t=>! /추천상품|관련상품|다른상품/.test(t)).join(' ');
 const points=PURCHASE_POINTS[category==='health'?'health':'digital'].filter(([re])=>re.test(evidence));
 const index=((Number(variant)||0)%10+10)%10;
 const available=points.length?points:[[null,'구성부터 살펴볼까요?',category==='health'?'섭취 안내를 확인해요.':'상세 사양을 확인해요.','나에게 맞는 구성으로']];
 const first=available[index%available.length],second=available[(index+1)%available.length];
 const rows=[
 [HOOK_SCRIPTS[index][0],''],
 [first[1],first[2]],
 [points.length>1?'이것도 확인해 보세요.':'내가 쓸 때를 생각해 봐요.',points.length>1?second[2]:category==='health'?'섭취 방법도 살펴봐요.':'사용할 공간도 살펴봐요.'],
 [category==='health'?'꾸준히 챙길 수 있을까요?':'자주 손이 갈까요?','나에게 맞는지 따져봐요.'],
 [['찾던 조건에 맞나요?','이 구성이 마음에 드나요?','필요한 조건을 갖췄나요?','내 생활에 잘 맞겠죠?','비교해 보니 어떤가요?'][index%5],'상세페이지에서 골라보세요.']
 ];
 return {purpose,scriptVariant:index,templateId:template.id,totalDuration:15,scenes:rows.map(([headline,sub],i)=>({key:template.id+'-'+i,start:template.cuts[i],end:template.cuts[i+1],duration:template.cuts[i+1]-template.cuts[i],headline,sub}))};
}
