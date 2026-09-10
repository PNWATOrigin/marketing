const WIDTH=720, HEIGHT=1280, FPS=30;
const escapePath=value=>String(value).replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"'\\''");
function size(text){return Math.min(48,Math.floor(610/Math.max(1,[...String(text)].length)));}
function caption(text,file,font,y,duration,decoration=false){
 const source=file?`textfile='${escapePath(file)}'`:`text='${String(text).replace(/[\\':;\[\],]/g,' ')}'`;
 return `drawtext=fontfile='${escapePath(font)}':${source}:expansion=none:fontsize=${decoration?30:size(text)}:fontcolor=0xFFF1FA:borderw=4:bordercolor=0xF369B1:shadowcolor=0xEE68B0@0.6:shadowx=2:shadowy=3:x=(w-text_w)/2:y='${y}-10*exp(-12*t)*cos(18*t)':alpha='min(1,t/0.10)*min(1,(${duration}-t)/0.10)'`;
}
export function buildRenderPlan({scenes,sceneImagePaths,fonts}){
 if(scenes.length!==sceneImagePaths.length)throw new Error('장면 수와 이미지 수가 다릅니다.');
 const inputArgs=sceneImagePaths.flatMap(p=>['-i',p]);
 const filters=scenes.map((scene,i)=>{
 const frames=Math.round(scene.duration*FPS),z=i%2?`1.06-0.06*on/${frames}`:`1+0.06*on/${frames}`;
 return `[${i}:v]trim=end_frame=1,split[bg${i}][fg${i}];`+
 `[bg${i}]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,gblur=sigma=24,eq=brightness=-0.08[b${i}];`+
 `[fg${i}]scale=720:950:force_original_aspect_ratio=decrease[f${i}];`+
 `[b${i}][f${i}]overlay=(W-w)/2:300+(850-h)/2,zoompan=z='${z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frames}:s=720x1280:fps=30,setsar=1,`+
 caption(scene.headline,scene.textFiles?.headline,fonts.bold,190,scene.duration)+','+
 caption(scene.sub||'',scene.textFiles?.sub,fonts.bold,254,scene.duration)+','+
 caption('♡     ♡',null,fonts.bold,330,scene.duration,true)+`,format=yuv420p[v${i}]`;
 });
 const totalDuration=scenes.reduce((n,s)=>n+s.duration,0);
 return {inputArgs,filterComplex:filters.join(';')+';'+scenes.map((_,i)=>`[v${i}]`).join('')+`concat=n=${scenes.length}:v=1:a=0,fade=t=out:st=${totalDuration-.25}:d=0.25[vout]`,outputLabel:'[vout]',totalDuration,width:WIDTH,height:HEIGHT,fps:FPS};
}
export const RENDER_CONSTANTS={WIDTH,HEIGHT,FPS};
