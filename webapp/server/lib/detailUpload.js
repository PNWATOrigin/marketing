import {imageSignature} from './images.js';
export function decodeDetailUpload(value){
  if(value===undefined || value===null || value==='')return null;
  if(typeof value!=='string'||value.length>28*1024*1024)throw new Error('상세이미지는 최대 20MB로 넣어주세요.');
  const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)throw new Error('상세이미지는 JPG·PNG 파일만 넣을 수 있어요.');
  const buffer=Buffer.from(match[2],'base64');
  if(buffer.length>20*1024*1024)throw new Error('상세이미지는 최대 20MB로 넣어주세요.');
  const ext=imageSignature(buffer);
  if(!['.jpg','.png'].includes(ext) || (match[1]==='png')!==(ext==='.png'))throw new Error('올바른 JPG·PNG 이미지 파일을 선택해주세요.');
  return {buffer,ext};
}
