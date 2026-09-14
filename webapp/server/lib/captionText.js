export function wrapCaption(text,maxChars=10){
 const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
 const lines=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(line&&[...next].length>maxChars){lines.push(line);line=word;}else line=next;}
 if(line)lines.push(line);return lines.join('\n');
}
export function simplifyCaptionProduct(text,product,category){
 let value=String(text||'').replace(/\s+/g,' ').trim();
 const name=String(product.name||'').trim();
 if(category!=='health'||[...name.replace(/\s/g,'')].length<=10)return value;
 const escaped=[...name.replace(/\s/g,'')].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
 if(escaped)value=value.replace(new RegExp(escaped,'giu'),'영양제');
 return value.replace(/영양제은/g,'영양제는').replace(/영양제을/g,'영양제를').replace(/영양제과/g,'영양제와');
}
