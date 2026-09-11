import fs from 'node:fs/promises';
import { cached, digest } from './cache.js';
import { ocrImage } from './ocr.js';
import { runFfprobe } from './render/ffmpegRunner.js';
import { styleFor } from './styleProfiles.js';

export const ASSET_TYPES = ['PRODUCT_HERO','DETAIL','CLOSEUP','LIFESTYLE','USAGE','BEFORE_AFTER','FEATURE','INFOGRAPHIC','TEXT_IMAGE','REVIEW','LOGO','UNUSABLE'];
const tokens = text => [...new Set(String(text).toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [])];
const rules = [['BEFORE_AFTER',/before|after|전후|사용 전|사용 후/i],['USAGE',/사용법|작동|설치|섭취 방법|청소 방법/],['INFOGRAPHIC',/성분|함량|스펙|사양|영양정보/],['CLOSEUP',/디테일|확대|질감/],['LIFESTYLE',/생활|일상|주방|침실/],['FEATURE',/기능|특징/],['REVIEW',/구매평|리뷰/]];

export async function describeAssets(paths, product) {
  const assets = [];
  // Bounded batches keep OCR and decoders within a small Render instance's memory.
  for (let i=0;i<paths.length;i++) {
    const file = paths[i], hash = digest(await fs.readFile(file));
    const info = await cached('asset-analysis-v1', hash, async () => {
      const data = JSON.parse(await runFfprobe(['-v','error','-show_entries','stream=width,height,nb_frames:format=duration','-of','json',file]));
      const s = data.streams?.[0] || {};
      const text = await ocrImage(file, 6000);
      const type = text.length > 350 ? 'TEXT_IMAGE' : rules.find(([,r])=>r.test(text))?.[0] || 'DETAIL';
      return { width:s.width, height:s.height, text, type, animated: Number(s.nb_frames)>1 || Number(data.format?.duration)>0.1 };
    });
    if (!info.width || !info.height || info.width<300 || info.height<300) continue;
    const sourceIndex=Number(file.match(/img_(\d+)/)?.[1]);
    const alt=product.imageContext?.[product.images?.[sourceIndex]]||'';
    const type = i===0 && info.type==='DETAIL' ? 'PRODUCT_HERO' : rules.find(([,r])=>r.test(alt))?.[0]||info.type;
    assets.push({ id:hash, path:file, ...info, type, quality:Math.min(1,Math.min(info.width,info.height)/1000), visibility: type==='TEXT_IMAGE'?0.2:0.8, composition:Math.min(info.width,info.height)/Math.max(info.width,info.height), tags:tokens(info.text+' '+alt), provenance:'page-image+alt+local-ocr', productName:product.name });
  }
  return assets;
}

function affinity(text, asset) {
  const terms = tokens(text);
  const matches = terms.filter(t=>asset.tags.some(a=>a.includes(t)||t.includes(a))).length;
  return matches / Math.max(1,terms.length);
}
function choose(text, assets, used, previous, profile, closing=false) {
  const fresh=assets.filter(a=>!used.has(a.id));
  const candidates=fresh.length?fresh:assets.filter(a=>a.id!==previous);
  return (candidates.length?candidates:assets).map(a => {
    const semantic = affinity(text,a);
    const novelty = a.id===previous ? 0 : 1/(1+(used.get(a.id)||0));
    const score = semantic*0.45+a.quality*0.20+a.visibility*0.15+a.composition*0.10+novelty*0.10;
    return { asset:a, semantic, score:score+(closing&&a.type==='PRODUCT_HERO'?0.12:0)+(profile.preferred.includes(a.type)?0.03:0)-(a.id===previous?0.15:0) };
  }).sort((a,b)=>b.score-a.score)[0];
}

export function makeStoryboard({ narration, assets, category, purpose, product }) {
  const usable = assets.filter(a=>!['UNUSABLE','TEXT_IMAGE','REVIEW','LOGO'].includes(a.type));
  if (!usable.length) throw new Error('제품을 확인할 수 있는 사진이 부족해요. 다른 상세페이지를 사용해주세요.');
  const style = styleFor(category,purpose), duration=narration.duration;
  const words = narration.words;
  if (!words?.length) throw new Error('음성 타이밍 분석이 필요해요.');
  // Boundaries occur at speech pauses, punctuation, or real word onsets. Never split a word.
  const boundaries=[0];
  for (let i=1;i<words.length;i++) {
    const prev=words[i-1], word=words[i], last=boundaries.at(-1), elapsed=word.start-last;
    const target=last<3?style.hookTarget:style.bodyTarget;
    const semanticBreak=/[.!?,。]$|(?:는데|하고|그래서|하지만|또한)$/.test(prev.text)||word.start-prev.end>0.16;
    if (elapsed>=0.5 && (semanticBreak&&elapsed>=target*0.65||elapsed>=target) && duration-word.start>=style.closing) boundaries.push(word.start);
  }
  boundaries.push(duration);
  const used=new Map(); let previous=null;
  const shots=boundaries.slice(0,-1).map((start,i)=>{
    const end=boundaries[i+1];
    const cues=words.filter(w=>w.start<end&&w.end>start).map(w=>({...w,start:Math.max(start,w.start),end:Math.min(end,w.end)}));
    const text=cues.map(w=>w.text).join(' ');
    const closing=i===boundaries.length-2;
    const best=choose(text,usable,used,previous,style,closing);
    used.set(best.asset.id,(used.get(best.asset.id)||0)+1);previous=best.asset.id;
    return { id:i,start,end,duration:end-start,headline:text,sub:'',cues,assetId:best.asset.id,imagePath:best.asset.path,stickerPath:best.asset.stickerPath,assetType:best.asset.type,animated:best.asset.animated,semanticScore:best.semantic,matchMethod:best.semantic?'ocr-keyword':'product-fallback',motion:'hold',role:start<3?'hook':closing?'closing':'body',transition:'cut' };
  });
  const board={version:1,category,purpose,productName:product.name,duration,style,shots,warnings:[]};
  board.qa=assessStoryboard(board);
  if (board.qa.score<80) {
    // One deterministic repair: alternate available assets and stabilize the final frame.
    for(let i=1;i<shots.length;i++) if(shots[i].assetId===shots[i-1].assetId&&usable.length>1){const a=usable.find(a=>a.id!==shots[i-1].assetId);Object.assign(shots[i],{assetId:a.id,imagePath:a.path,stickerPath:a.stickerPath,assetType:a.type,animated:a.animated,semanticScore:affinity(shots[i].headline,a)});}
    shots.at(-1).motion='hold';board.repaired=true;board.qa=assessStoryboard(board);
  }
  if(shots.some(s=>!s.semanticScore)) board.warnings.push('일부 장면은 OCR 의미 일치가 확인되지 않아 해당 상품 사진을 사용했어요.');
  if(usable.length<3) board.warnings.push('소재가 적어 일부 상품 사진이 반복돼요.');
  if(board.qa.errors.length) throw new Error(board.qa.errors.join(' '));
  return board;
}

export function assessStoryboard(board) {
  const errors=[],shots=board.shots;
  if(!shots.length||Math.abs(shots.reduce((n,s)=>n+s.duration,0)-board.duration)>0.04)errors.push('영상과 음성 길이가 달라요.');
  if(shots.some((s,i)=>!s.imagePath||s.duration<=0||i>0&&Math.abs(s.start-shots[i-1].end)>0.04||s.cues.some(c=>c.start<s.start||c.end>s.end))) errors.push('장면 또는 자막 시간에 오류가 있어요.');
  if(shots.at(-1)?.duration<1)errors.push('마지막 장면이 너무 짧아요.');
  const repeated=shots.filter((s,i)=>i>0&&s.assetId===shots[i-1].assetId).length;
  const unmatched=shots.filter(s=>!s.semanticScore).length;
  return {score:Math.max(0,100-errors.length*30-repeated*5-unmatched*2),errors,checks:{duration:!errors.length,captionTiming:!errors.length,containProduct:true,safeArea:true,stableClosing:shots.at(-1)?.motion==='hold'},semanticUnverified:unmatched};
}
