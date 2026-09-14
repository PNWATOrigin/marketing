import fs from 'node:fs/promises';
import path from 'node:path';
import {runFfmpeg,runFfprobe} from './render/ffmpegRunner.js';
import {safeFetch} from './safeHttp.js';
export const aiVideoEnabled=()=>process.env.AI_VIDEO_ENABLED==='true';
export function aiVideoConfigured(){return !!process.env.RUNWAYML_API_SECRET;}
export async function runwayRequest(endpoint,body,fetcher=fetch){
 const response=await fetcher('https://api.dev.runwayml.com/v1/'+endpoint,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+process.env.RUNWAYML_API_SECRET,'X-Runway-Version':'2024-11-06','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('AI 영상 요청 실패 ('+response.status+'). API 설정과 크레딧을 확인해주세요.');
 return response.json();
}
// No automatic paid retries. The existing photo flow remains available when disabled.
export async function addAiClips(board,workDir,onProgress=()=>{}){
 if(!aiVideoEnabled()){board.visualMode='source-photos';return;}
 if(!aiVideoConfigured())throw new Error('AI 영상 API 키가 설정되지 않았어요.');
 const dir=path.join(workDir,'ai-video');await fs.mkdir(dir,{recursive:true});
 const sources=[...new Set(board.shots.filter(s=>!s.animated).map(s=>s.imagePath))].slice(0,3);
 board.aiVideo={provider:'runway',model:'gen4_turbo',clips:[]};
 for(const [i,source] of sources.entries()){
  const jpg=path.join(dir,`input-${i}.jpg`),mp4=path.join(dir,`clip-${i}.mp4`);
  await runFfmpeg(['-y','-i',source,'-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280','-frames:v','1','-q:v','3',jpg],{timeoutMs:20000});
  const bytes=await fs.readFile(jpg);if(bytes.length>3300000)throw new Error('AI 입력 이미지 크기를 줄이지 못했어요.');
  const task=await runwayRequest('image_to_video',{model:'gen4_turbo',promptImage:'data:image/jpeg;base64,'+bytes.toString('base64'),promptText:'A stable product advertisement shot. Very subtle smooth camera movement. Preserve the exact product shape, packaging, colors and existing labels. Do not add text, objects, hands or people. No shaking. No transformations.',ratio:'720:1280',duration:5});
  if(!task.id)throw new Error('AI 영상 작업 ID를 받지 못했어요.');
  const record={taskId:task.id,source,duration:5};board.aiVideo.clips.push(record);
  let result;const deadline=Date.now()+240000;
  while(Date.now()<deadline){
   result=await runwayRequest('tasks/'+encodeURIComponent(task.id));
   if(result.status==='SUCCEEDED')break;
   if(['FAILED','CANCELED','CANCELLED'].includes(result.status))throw new Error('AI 영상 생성에 실패했어요. 자동 유료 재시도는 하지 않습니다.');
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(result?.status!=='SUCCEEDED'||!result.output?.[0])throw new Error('AI 영상 대기 시간이 초과됐어요. 자동 유료 재시도는 하지 않습니다.');
  const file=await safeFetch(result.output[0],{timeoutMs:60000,maxBytes:64*1024*1024,accept:'video/*'});
  if(file.status!==200)throw new Error('AI 영상 다운로드에 실패했어요.');
  await fs.writeFile(mp4,file.body);
  const probe=JSON.parse(await runFfprobe(['-v','error','-show_entries','stream=codec_type:format=duration','-of','json',mp4]));
  if(!probe.streams?.some(s=>s.codec_type==='video')||Number(probe.format?.duration)<4.8)throw new Error('AI 영상 길이 또는 형식을 확인하지 못했어요.');
  for(const shot of board.shots)if(shot.imagePath===source){shot.originalImagePath=source;shot.imagePath=mp4;shot.animated=true;shot.generatedVideo=true;}
  record.path=mp4;onProgress(i+1,sources.length);
 }
 board.visualMode=sources.length?'ai-video-and-source-media':'source-media';
}
