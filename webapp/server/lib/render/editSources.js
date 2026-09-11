import fs from 'node:fs/promises';
import path from 'node:path';

// Locally synthesized, quiet spring-like sound. No voice or external sound API.
export function boingTrack(duration, times) {
  const rate=48000, count=Math.ceil(duration*rate), out=Buffer.alloc(44+count*2);
  out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);
  out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(count*2,40);
  for(const start of new Set(times.map(t=>Math.round(t*rate))))for(let i=0;i<rate*0.2&&start+i<count;i++){
    const t=i/rate, envelope=Math.min(1,t/0.008)*Math.exp(-24*t);
    const sample=Math.sin(2*Math.PI*(620*t-850*t*t+0.4*Math.sin(2*Math.PI*16*t)))*envelope*0.075;
    const offset=44+(start+i)*2;
    out.writeInt16LE(Math.max(-32768,Math.min(32767,out.readInt16LE(offset)+Math.round(sample*32767))),offset);
  }
  return out;
}
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(b){let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
// Stored ZIP: one media file in memory at a time, without an extra dependency.
export async function writeZip(destination, entries){
 const file=await fs.open(destination,'w');let offset=0;const central=[];
 try{
  for(const e of entries){
   const data=e.path?await fs.readFile(e.path):Buffer.from(e.text||'','utf8'),name=Buffer.from(e.name);
   const crc=crc32(data),head=Buffer.alloc(30);
   head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(33,12);head.writeUInt32LE(crc,14);head.writeUInt32LE(data.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(name.length,26);
   const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(33,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(data.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);
   central.push(record,name);await file.write(head);await file.write(name);await file.writeFile(data);offset+=head.length+name.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  await file.write(directory);await file.write(end);
 }finally{await file.close();}
}
const stamp=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
const xmlEscape=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function timelineXml(shots){
 const rate='<rate><timebase>30</timebase><ntsc>FALSE</ntsc></rate>';
 const duration=Math.round(Math.max(...shots.map(s=>s.end),0)*30);
 const clip=(asset,start,end,id,audio=false,gain=1)=>{
  const first=Math.round(start*30),last=Math.round(end*30),length=last-first;
  return `<clipitem id="clip-${id}"><name>${xmlEscape(asset)}</name><duration>${length}</duration>${rate}<start>${first}</start><end>${last}</end><in>0</in><out>${length}</out><file id="file-${id}"><name>${xmlEscape(asset.split('/').pop())}</name><pathurl>file://localhost/${xmlEscape(asset)}</pathurl>${rate}<duration>${duration}</duration><media>${audio?'<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>':'<video><stillframe>TRUE</stillframe></video>'}</media></file>${audio?`<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack><filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory><effecttype>audio</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name><value>${gain}</value></parameter></effect></filter>`:''}</clipitem>`;
 };
 return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5"><sequence id="product-shortform"><name>Product Shortform</name><duration>${duration}</duration>${rate}<media><video><format><samplecharacteristics>${rate}<width>1080</width><height>1920</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format><track>${shots.map((s,i)=>clip(s.asset,s.start,s.end,i)).join('')}</track></video><audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format><track>${clip('audio/bgm.mp3',0,duration/30,'bgm',true,0.35)}</track><track>${clip('audio/boing-timed.wav',0,duration/30,'sfx',true)}</track></audio></media></sequence></xmeml>`;
}
export async function exportSources({outputPath,scenes,cues,bgm,effects,sourceData,imagePaths=[]}){
 const paths=[...new Set(scenes.map(s=>s.imagePath))];
 const names=paths.map((p,i)=>`media/product-${i+1}${path.extname(p)}`);
 const shots=scenes.map(s=>({start:s.start,end:s.end,asset:names[paths.indexOf(s.imagePath)],transition:'cut',fit:'contain'}));
 const xml=timelineXml(shots);
 await fs.writeFile(outputPath.replace(/\.mp4$/,'.timeline.xml'),xml,'utf8');
 await writeZip(outputPath.replace(/\.mp4$/,'.sources.zip'),[
  ...paths.map((p,i)=>({name:names[i],path:p})),
  ...[...new Set(imagePaths)].filter(p=>!paths.includes(p)).map((p,i)=>({name:`prepared/image-${i+1}${path.extname(p)}`,path:p})),
  ...(sourceData?[{name:'analysis/product.json',text:JSON.stringify(sourceData.product,null,2)},{name:'analysis/script.json',text:JSON.stringify(sourceData.script,null,2)},{name:'analysis/storyboard.json',text:JSON.stringify(sourceData.storyboard,(key,value)=>['imagePath','stickerPath','originalPath'].includes(key)?undefined:value,2)},{name:'analysis/settings.json',text:JSON.stringify({sourceUrl:sourceData.product?.sourceUrl,category:sourceData.category,purpose:sourceData.purpose,audioMode:'bgm-only'},null,2)}]:[]),
  ...[...new Set(scenes.map(s=>s.stickerPath).filter(Boolean))].map((p,i)=>({name:`stickers/sticker-${i+1}.png`,path:p})),
  {name:'audio/bgm.mp3',path:bgm},{name:'audio/boing-timed.wav',path:effects},
  {name:'captions.srt',text:cues.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n')},
  {name:'timeline.xml',text:xml},
  {name:'timeline.json',text:JSON.stringify({width:1080,height:1920,fps:30,shots,bgmVolume:0.35,effectsVolume:1},null,2)},
  {name:'README.txt',text:'편집용 소스 묶음 (완성 MP4와 별개)\n압축을 풀고 media 파일과 audio 파일을 편집기에 가져오세요.\n1080x1920 / 30fps 시퀀스에서 timeline.json의 start/end(초)에 맞춰 이미지를 배치하세요.\nboing-timed.wav는 0초부터 놓으면 자막 등장 시점과 맞습니다. BGM 음량은 35%, 길이는 15초로 맞추세요.\ncaptions.srt에는 수정 가능한 문구와 시간이 있습니다. 편집기에서 자막 파일 가져오기를 지원하면 사용하세요.\n프리미어: timeline.xml을 가져온 후 누락된 미디어 연결에서 이 폴더의 media/audio 파일을 선택하세요. XML에는 영상과 오디오 컷 타이밍이 포함됩니다. 자막은 captions.srt를 별도로 가져오세요. 이미지 크기/글꼴은 조정이 필요할 수 있습니다. XML 단독에는 소재가 없으므로 ZIP도 필요합니다. 캡컷은 소재와 SRT를 직접 가져오세요.\n'},
 ]);
}
