export function wrapCaption(text,maxChars=10){
 const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
 const lines=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(line&&[...next].length>maxChars){lines.push(line);line=word;}else line=next;}
 if(line)lines.push(line);return lines.join('\n');
}

const PRODUCT_KEYWORDS = [
 ['콜라겐', /콜라겐|collagen/i], ['유산균', /유산균|프로바이오틱스|probiotics/i],
 ['칼슘', /칼슘|calcium/i], ['오메가3', /오메가[-\s]*3|omega[-\s]*3/i],
 ['루테인', /루테인|lutein/i], ['마그네슘', /마그네슘/i], ['비타민D', /비타민\s*d/i],
 ['비타민C', /비타민\s*c/i], ['비타민B', /비타민\s*b/i], ['멀티비타민', /멀티비타민|종합비타민/i],
 ['홍삼', /홍삼/], ['철분', /철분/], ['아연', /아연/], ['밀크씨슬', /밀크씨슬|밀크시슬/],
 ['글루타치온', /글루타치온/], ['단백질', /단백질|프로틴/], ['포스파티딜세린', /포스파티딜세린/],
 ['레몬즙', /레몬즙/], ['올리브오일', /올리브오일|올리브유/], ['식이섬유', /식이섬유/]
];
function findKeyword(text){
 const normalized=String(text||'').normalize('NFKC').replace(/\s+/g,'');
 return PRODUCT_KEYWORDS.map(([name,re])=>({name,index:normalized.search(re)}))
  .filter(x=>x.index>=0).sort((a,b)=>a.index-b.index)[0]?.name;
}
export function captionProductName(product,category){
 const name=String(product.name||'').replace(/\s+/g,' ').trim();
 if(category!=='health')return name.slice(0,28)||'이 상품';
 if(name&&[...name.replace(/\s/g,'')].length<=10&&name!=='영양제')return name;
 const titleKeyword=findKeyword(name);
 if(titleKeyword)return titleKeyword;
 // Only explicit identity / main-ingredient lines may supply a missing title keyword.
 const evidence=[product.description,...(product.features||[]),...(product.detailLines||[])]
  .filter(x=>typeof x==='string'&&/제품명|식품유형|주원료|주성분|주요 원료/.test(x)
   &&! /추천|다른 상품|관련 상품/.test(x));
 const candidates=[...new Set(evidence.map(findKeyword).filter(Boolean))];
 return candidates.length===1?candidates[0]:'영양제';
}
export function simplifyCaptionProduct(text,product,category){
 let value=String(text||'').replace(/\s+/g,' ').trim();
 const name=String(product.name||'').trim();
 if(category!=='health'||[...name.replace(/\s/g,'')].length<=10)return value;
 const label=captionProductName(product,category);
 const escaped=[...name.replace(/\s/g,'')].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
 const last=label.charCodeAt(label.length-1);
 const batchim=last>=0xAC00&&last<=0xD7A3&&(last-0xAC00)%28!==0;
 if(escaped)value=value.replace(new RegExp(escaped+'(은|는|을|를|과|와)?','giu'),(_,particle)=>
  label+(particle?(/[은는]/.test(particle)?(batchim?'은':'는'):/[을를]/.test(particle)?(batchim?'을':'를'):(batchim?'과':'와')):''));
 return value;
}

// Text-only breath grouping: keep particles with words and modifiers with the next word.
export function splitBreathCaptions(text,maxChars=10){
 const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
 const cost=Array(words.length+1).fill(Infinity),next=[];cost[words.length]=0;
 for(let i=words.length-1;i>=0;i--){
  for(let j=i;j<words.length;j++){
   const phrase=words.slice(i,j+1).join(' '),len=[...phrase].length;
   if(len>maxChars&&j>i)break;
   const word=words[j],end=j===words.length-1;
   const pause=/[,.!?…]$|(?:다면|라면|지만|고요|죠|해요|세요)$/.test(word);
   const dangling=/(?:하는|되는|맞는|고르는|필요한|위한|싶은|이런|그런|어떤|더|꼭)$/.test(word);
   const score=cost[j+1]+Math.abs(8-len)*.35+(len<4?4:0)+(dangling&&!end?8:0)-(pause?2:0)+1;
   if(score<cost[i]){cost[i]=score;next[i]=j+1;}
   if(/[,.!?…]$/.test(word))break;
  }
 }
 const parts=[];for(let i=0;i<words.length;i=next[i])parts.push(words.slice(i,next[i]).join(' '));
 return parts;
}
