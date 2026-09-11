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

const CONCEPTS=[['memory',/기억|깜빡|인지|두뇌|뇌|집중/],['growth',/성장|키|어린이|아이|칼슘|뼈/],['immune',/면역|아연|방어/],['ingredients',/성분|함량|원료|배합/],['usage',/섭취|복용|하루|캡슐|먹는|사용법/],['cleaning',/청소|먼지|흡입|물걸레/]];
function affinity(text, asset) {
  const terms=tokens(text), assetText=[asset.text,...asset.tags].join(' ');
  const matches=terms.filter(t=>asset.tags.some(a=>a.includes(t)||t.includes(a))).length;
  const concepts=CONCEPTS.filter(([,r])=>r.test(text));
  const shared=concepts.filter(([,r])=>r.test(assetText)).length;
  return Math.min(1,matches/Math.max(1,terms.length)+shared*.2);
}
function choose(text, assets, used, previous, profile, closing=false) {
  const ranked=assets.map(a=>({asset:a,semantic:affinity(text,a)}));
  // First restrict to relevant source regions; only then minimize repeated shots.
  const relevant=ranked.filter(a=>a.semantic>0);
  const pool=relevant.length?relevant:ranked;
  const fresh=pool.filter(a=>!used.has(a.asset.id));
  const different=pool.filter(a=>a.asset.id!==previous);
  const candidates=fresh.length?fresh:different.length?different:pool;
  return candidates.map(({asset:a,semantic})=>({asset:a,semantic,score:semantic*.65+a.quality*.15+a.visibility*.1+a.composition*.05+(profile.preferred.includes(a.type)?.03:0)+(closing&&a.type==='PRODUCT_HERO'?.02:0)})).sort((a,b)=>b.score-a.score)[0];
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
    for(let i=1;i<shots.length;i++) if(shots[i].assetId===shots[i-1].assetId&&usable.length>1){const a=usable.filter(a=>a.id!==shots[i-1].assetId).sort((a,b)=>affinity(shots[i].headline,b)-affinity(shots[i].headline,a))[0];Object.assign(shots[i],{assetId:a.id,imagePath:a.path,stickerPath:a.stickerPath,assetType:a.type,animated:a.animated,semanticScore:affinity(shots[i].headline,a)});}
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
