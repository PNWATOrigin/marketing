import {splitBreathCaptions} from './captionText.js';
export function validateCustomCaption(value=''){
 if(typeof value!=='string'||[...value].length>100)throw new Error('직접 작성 문구는 최대 100자까지 입력해주세요.');
 return value.replace(/\s+/g,' ').trim();
}
export function customTiming(text){
 const chunks=splitBreathCaptions(text,10).flatMap(t=>{const a=[...t],out=[];for(let i=0;i<a.length;i+=10)out.push(a.slice(i,i+10).join(''));return out;});
 return {duration:15,sceneBoundaries:[0,3,6,9,12,15],words:chunks.map((text,i)=>({text,start:i*15/chunks.length,end:(i+1)*15/chunks.length}))};
}
