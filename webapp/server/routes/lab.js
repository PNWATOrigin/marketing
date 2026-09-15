import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {config} from '../config.js';
import {decodeDetailUploads} from '../lib/detailUpload.js';
import {prepareDetailImage} from '../lib/images.js';
import {selectOcrPaths} from '../lib/ocrSampling.js';
import {cloudflareReady,generateLabBackground} from '../lib/cloudflareBackground.js';
import {runFfmpeg,runFfprobe} from '../lib/render/ffmpegRunner.js';
import {queueMediaTask} from '../lib/jobManager.js';
export const labRouter=express.Router();
const exec=promisify(execFile), jobs=new Map(),root=path.join(config.dataDir,'lab');
const pending=new Set();
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const owner=req=>/^[a-z0-9_-]{8,64}$/i.test(req.get('x-client-id')||'')?req.get('x-client-id'):null;
function pub(j){return {id:j.id,status:j.status,progress:j.progress,error:j.error,candidates:j.candidates?.map((c,i)=>({index:i,url:`/api/lab/jobs/${j.id}/cutout/${i}`}))||[],video:j.status==='completed'?`/api/lab/jobs/${j.id}/video`:null,aiReady:cloudflareReady()};}
async function persist(j){await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,j.id,'job.json'),JSON.stringify(j));}
async function patch(j,data){Object.assign(j,data,{updatedAt:Date.now()});await persist(j);}
async function python(script,args,timeout=60000){return exec(process.env.PYTHON_PATH||'python3',[fileURLToPath(new URL(`../lib/${script}`,import.meta.url)),...args],{timeout,windowsHide:true,maxBuffer:1024*1024,env:{...process.env,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'}});}
// Opaque job URLs act as share links; no listing API exposes another person's uploads.
async function find(id){if(!/^[a-f0-9-]{36}$/i.test(id))return null;if(jobs.has(id))return jobs.get(id);try{const j=JSON.parse(await fs.readFile(path.join(root,id,'job.json'),'utf8'));if(Date.now()-j.createdAt>2*3600000)return null;if(['queued','extracting','generating','rendering'].includes(j.status)){j.status='failed';j.error='서버가 재시작됐어요. 이미지를 다시 올려주세요.';}jobs.set(id,j);return j;}catch{return null;}}
labRouter.get('/config',(_q,r)=>r.json({aiReady:cloudflareReady(),maxImages:3,maxBytes:20*1024*1024}));
labRouter.post('/jobs',express.json({limit:'84mb'}),wrap(async(req,res)=>{
 const client=owner(req);if(!client)return res.status(400).json({error:'브라우저를 새로고침해주세요.'});
 if(pending.size>=3 || [...jobs.values()].some(j=>j.owner===client&&pending.has(j.id)))return res.status(429).json({error:'현재 제작 요청이 있어요. 완료 후 다시 시도해주세요.'});
 let images;try{images=decodeDetailUploads(req.body.images);if(!images.length)throw Error('상세이미지를 넣어주세요.');}catch(e){return res.status(400).json({error:e.message});}
 const id=crypto.randomUUID(),dir=path.join(root,id);await fs.mkdir(dir,{recursive:true});
 const j={id,owner:client,status:'queued',progress:1,createdAt:Date.now(),updatedAt:Date.now(),candidates:[]};jobs.set(id,j);pending.add(id);
 try{j.inputs=[];for(const [i,img] of images.entries()){const p=path.join(dir,`original-${i}${img.ext}`);await fs.writeFile(p,img.buffer);j.inputs.push(p);}await persist(j);}catch(e){pending.delete(id);throw e;}
 queueMediaTask(async()=>{try{
  await patch(j,{status:'extracting',progress:5});
  const cuts=selectOcrPaths(await prepareDetailImage(j.inputs,path.join(dir,'cuts')),6);
  const {stdout}=await python('labCutout.py',['--batch',JSON.stringify(cuts),dir],180000);
  j.candidates=JSON.parse(stdout);
  if(!j.candidates.length)throw Error('깨끗하게 분리할 제품을 찾지 못했어요. 제품이 크게 나온 상세이미지 또는 제품 사진으로 다시 시도해주세요.');
  await patch(j,{status:'ready',progress:100});
 }catch(e){await patch(j,{status:'failed',error:e.message,progress:0});}finally{pending.delete(id);}});
 res.status(201).json(pub(j));
}));
labRouter.get('/jobs/:id',wrap(async(req,res)=>{const j=await find(req.params.id);if(!j)return res.sendStatus(404);res.json(pub(j));}));
labRouter.get('/jobs/:id/cutout/:index',wrap(async(req,res)=>{const j=await find(req.params.id),i=Number(req.params.index);const c=Number.isInteger(i)&&i>=0?j?.candidates[i]:null;if(!c)return res.sendStatus(404);res.sendFile(path.resolve(c.file));}));
labRouter.get('/jobs/:id/video',wrap(async(req,res)=>{const j=await find(req.params.id);if(j?.status!=='completed')return res.sendStatus(404);if(req.query.download==='1')res.download(path.join(root,j.id,'video.mp4'),'short studio_AI-background.mp4');else res.sendFile(path.join(root,j.id,'video.mp4'));}));
let day='',count=0;
labRouter.post('/jobs/:id/start',express.json({limit:'10kb'}),wrap(async(req,res)=>{
 const j=await find(req.params.id);if(!j||j.owner!==owner(req))return res.sendStatus(403);
 if(!cloudflareReady())return res.status(503).json({error:'Cloudflare 계정 연결을 준비 중이에요. 제품 추출은 사용할 수 있어요.'});
 if(j.status!=='ready'||pending.has(j.id)||pending.size>=3)return res.status(409).json({error:'현재 상태에서는 제작을 시작할 수 없어요.'});
 const index=Number(req.body.index),mood=req.body.mood;if(!Number.isInteger(index)||!j.candidates[index]||!['clean','warm','premium'].includes(mood))return res.status(400).json({error:'제품 컷과 배경 분위기를 선택해주세요.'});
 const today=new Date().toISOString().slice(0,10);if(day!==today){day=today;try{const saved=JSON.parse(await fs.readFile(path.join(root,'usage.json'),'utf8'));count=saved.day===day?saved.count:0;}catch{count=0;}}
 if(count>=30)return res.status(429).json({error:'임시 체험 페이지의 오늘 제작 한도에 도달했어요. 내일 다시 이용해주세요.'});
 count++;await fs.writeFile(path.join(root,'usage.json'),JSON.stringify({day,count}));pending.add(j.id);await patch(j,{status:'queued',progress:1,error:null});
 queueMediaTask(async()=>{const dir=path.join(root,j.id);try{
  const c=j.candidates[index],scenes=[];await patch(j,{status:'generating',progress:5});
  for(let i=0;i<3;i++){
   const bg=path.join(dir,`background-${i}.jpg`),scene=path.join(dir,`scene-${i}.jpg`);
   await generateLabBackground({palette:c.palette,mood,variant:i,outputPath:bg});
   await python('labComposite.py',[bg,c.file,scene]);scenes.push(scene);await patch(j,{progress:10+(i+1)*15});
  }
  await patch(j,{status:'rendering',progress:60});
  await renderLabVideo(scenes,path.join(dir,'video.mp4'),p=>{j.progress=60+Math.floor(p*39);});
  await patch(j,{status:'completed',progress:100});
 }catch(e){await patch(j,{status:'ready',error:e.message,progress:0});}finally{pending.delete(j.id);}});
 res.json(pub(j));
}));
const cleanup=setInterval(async()=>{try{for(const name of await fs.readdir(root)){if(!/^[a-f0-9-]{36}$/i.test(name)||pending.has(name))continue;const dir=path.join(root,name);const stat=await fs.stat(dir);if(Date.now()-stat.mtimeMs>2*3600000){jobs.delete(name);await fs.rm(dir,{recursive:true,force:true});}}}catch{}},300000);cleanup.unref();

export async function renderLabVideo(scenes,output,onProgress){
  const filter=scenes.map((_,i)=>`[${i}:v]fps=30,scale=1080:1920,setsar=1,trim=duration=5,setpts=PTS-STARTPTS,fade=t=in:d=0.15,fade=t=out:st=4.85:d=0.15[v${i}]`).join(';')+';[v0][v1][v2]concat=n=3:v=1:a=0[out];[3:a]volume=0.3,afade=t=out:st=14.5:d=0.5[a]';
  await runFfmpeg(['-y','-threads','1','-filter_complex_threads','1',...scenes.flatMap(p=>['-loop','1','-t','5','-i',p]),'-stream_loop','-1','-i',path.join(config.rootDir,'assets/bgm/loop-1.mp3'),'-filter_complex',filter,'-map','[out]','-map','[a]','-t','15','-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',output],{timeoutMs:180000,totalSeconds:15,onProgress});
  const probe=JSON.parse(await runFfprobe(['-v','error','-show_entries','format=duration:stream=width,height','-of','json',output]));
  if(Math.abs(Number(probe.format.duration)-15)>.15||!probe.streams.some(s=>s.width===1080&&s.height===1920))throw Error('영상 출력 검증에 실패했어요.');
}
