const WIDTH=1080, HEIGHT=1920, FPS=30;
// 아래 레이아웃 값들은 720x1280 기준으로 만들어졌던 것을 1080x1920(WIDTH/HEIGHT)에 맞춰
// 동일한 비율(1.5배)로 스케일링한 값이다. 실제 출력 해상도가 상품 정보 카드 등 다른 화면에
// 노출되는 "1080x1920" 규격과 어긋나면 다운로드한 영상을 다른 곳에서 못 쓰는 문제가 생긴다.
const SCALE = WIDTH / 720;
const FG_H = Math.round(950 * SCALE);
const OVERLAY_Y_BASE = Math.round(300 * SCALE);
const OVERLAY_Y_SPAN = Math.round(850 * SCALE);
const CAP_Y1 = Math.round(190 * SCALE);
const CAP_Y2 = Math.round(254 * SCALE);
const CAP_Y3 = Math.round(330 * SCALE);
const TEXT_WIDTH_BUDGET = Math.round(610 * SCALE);
const DECOR_FONT_SIZE = Math.round(30 * SCALE);
const BORDER_W = Math.round(4 * SCALE);

const escapePath=value=>String(value).replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"'\\''");
// 여러 줄로 줄바꿈된 자막은 가장 긴 줄 기준으로 폭에 맞춰 크기를 정한다.
function size(text){const longest=Math.max(1,...String(text).split('\n').map(l=>[...l].length));return Math.min(Math.round(48*SCALE),Math.floor(TEXT_WIDTH_BUDGET/longest));}
function caption(text,file,font,y,duration,decoration=false){
 const source=file?`textfile='${escapePath(file)}'`:`text='${String(text).replace(/[\\':;\[\],]/g,' ')}'`;
 return `drawtext=fontfile='${escapePath(font)}':${source}:expansion=none:fontsize=${decoration?DECOR_FONT_SIZE:size(text)}:line_spacing=${Math.round(8*SCALE)}:fontcolor=0xFFF1FA:borderw=${BORDER_W}:bordercolor=0xF369B1:shadowcolor=0xEE68B0@0.6:shadowx=2:shadowy=3:x=(w-text_w)/2:y='${y}-10*exp(-12*t)*cos(18*t)':alpha='min(1,t/0.10)*min(1,(${duration}-t)/0.10)'`;
}
export function buildRenderPlan({scenes,sceneImagePaths,fonts}){
 if(scenes.length!==sceneImagePaths.length)throw new Error('장면 수와 이미지 수가 다릅니다.');
 const inputArgs=sceneImagePaths.flatMap(p=>['-i',p]);
 const filters=scenes.map((scene,i)=>{
 const frames=Math.round(scene.duration*FPS);
 return `[${i}:v]trim=end_frame=1,split[bg${i}][fg${i}];`+
 `[bg${i}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=24,eq=brightness=-0.08[b${i}];`+
 `[fg${i}]scale=${WIDTH}:${FG_H}:force_original_aspect_ratio=decrease[f${i}];`+
 // zoompan은 정지 이미지를 프레임마다 다시 계산해서 미세하게 떨려 보이는 문제가 있어,
 // 대신 합성된 한 프레임을 그대로 붙잡아두는(loop) 방식으로 흔들림 없이 고정한다.
 `[b${i}][f${i}]overlay=(W-w)/2:${OVERLAY_Y_BASE}+(${OVERLAY_Y_SPAN}-h)/2,loop=loop=${frames - 1}:size=1:start=0,fps=${FPS},setsar=1,`+
 caption(scene.headline,scene.textFiles?.headline,fonts.bold,CAP_Y1,scene.duration)+','+
 caption(scene.sub||'',scene.textFiles?.sub,fonts.bold,CAP_Y2,scene.duration)+','+
 caption('●     ●',null,fonts.bold,CAP_Y3,scene.duration,true)+`,format=yuv420p[v${i}]`;
 });
 const totalDuration=scenes.reduce((n,s)=>n+s.duration,0);
 return {inputArgs,filterComplex:filters.join(';')+';'+scenes.map((_,i)=>`[v${i}]`).join('')+`concat=n=${scenes.length}:v=1:a=0,fade=t=out:st=${totalDuration-.25}:d=0.25[vout]`,outputLabel:'[vout]',totalDuration,width:WIDTH,height:HEIGHT,fps:FPS};
}
export const RENDER_CONSTANTS={WIDTH,HEIGHT,FPS};

export function buildNarrationPlan({scenes,fonts,style}) {
 const inputArgs=scenes.flatMap(s=>s.animated?['-stream_loop','-1','-i',s.imagePath]:['-i',s.imagePath]);
 const filters=scenes.map((s,i)=>{
   const frames=Math.round(s.end*FPS)-Math.round(s.start*FPS);
   const base=`[${i}:v]${s.animated?`trim=duration=${s.duration},setpts=PTS-STARTPTS,fps=${FPS},`:'trim=end_frame=1,'}scale=960:1450:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xF5F5F3,setsar=1`;
   const z=s.motion==='push'?`1+0.035*on/${Math.max(1,frames-1)}`:s.motion==='pull'?`1.035-0.035*on/${Math.max(1,frames-1)}`:'1';
   const x=s.motion==='pan'?`(iw-iw/zoom)/2+12*sin(on/${frames}*PI)`:'(iw-iw/zoom)/2';
   const movement=s.animated?`,tpad=stop_mode=clone:stop_duration=${s.duration},trim=end_frame=${frames}`:` ,zoompan=z='${z}':x='${x}':y='(ih-ih/zoom)/2':d=${frames}:s=1080x1920:fps=30`;
   const captions=(s.captionFiles||[]).map(c=>`drawtext=fontfile='${escapePath(fonts.bold)}':textfile='${escapePath(c.path)}':expansion=none:fontsize=48:fontcolor=${style.captionBox?'0x151515':'white'}:borderw=${style.captionBox?0:3}:bordercolor=black:box=${style.captionBox?1:0}:boxcolor=white@0.94:boxborderw=16:line_spacing=12:x=(w-text_w)/2:y=${style.captionY}:enable='gte(t,${c.start})*lt(t,${c.end})'`);
   return base+movement+(captions.length?','+captions.join(','):'')+`,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`;
 });
 return {inputArgs,filterComplex:filters.join(';')+';'+scenes.map((_,i)=>`[v${i}]`).join('')+`concat=n=${scenes.length}:v=1:a=0[vout]`,outputLabel:'[vout]',totalDuration:scenes.at(-1).end,width:WIDTH,height:HEIGHT,fps:FPS};
}
