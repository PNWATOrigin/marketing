import fs from 'node:fs/promises';
import {imageSignature} from './images.js';
export function cloudflareReady(){return /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID||'') && !!process.env.CLOUDFLARE_API_TOKEN;}
export function backgroundPrompt(palette,mood,variant=0){
 const moods={clean:'minimal clean studio, soft daylight',warm:'warm sunlight, natural soft shadows',premium:'premium studio, elegant sculptural podium'};
 return `Empty product photography background, ${moods[mood]||moods.clean}. Color palette ${palette.filter(x=>/^#[0-9a-f]{6}$/i.test(x)).slice(0,3).join(', ')}. ${['soft curved wall','subtle layered podium','gentle light rays'][variant%3]}. Empty center for compositing a product later. No products, no bottles, no people, no text, no letters, no logos. High quality studio lighting.`;
}
export async function generateLabBackground({palette,mood,variant,outputPath,fetcher=fetch}){
 if(!cloudflareReady())throw new Error('Cloudflare 연결 설정이 필요해요. 운영자가 연결하면 사용할 수 있어요.');
 const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,{
  method:'POST',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},
  body:JSON.stringify({prompt:backgroundPrompt(palette,mood,variant),steps:4}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(response.status===429?'오늘의 AI 생성 한도 또는 요청 제한에 도달했어요. 잠시 후 다시 시도해주세요.':'AI 배경 생성에 실패했어요. Cloudflare 연결과 무료 한도를 확인해주세요.');
 const json=await response.json();const raw=json.result?.image;
 if(!json.success||typeof raw!=='string'||raw.length>28*1024*1024)throw new Error('AI 배경 이미지 응답이 올바르지 않아요.');
 const bytes=Buffer.from(raw,'base64');if(!imageSignature(bytes))throw new Error('AI 배경 이미지가 손상됐어요.');
 await fs.writeFile(outputPath,bytes);
 return outputPath;
}
