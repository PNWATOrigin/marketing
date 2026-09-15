import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeDetailUpload} from '../server/lib/detailUpload.js';
test('optional upload leaves URL-only flow unchanged',()=>assert.equal(decodeDetailUpload(undefined),null));
test('rejects disguised or oversized non-images',()=>{
 assert.throws(()=>decodeDetailUpload('data:image/png;base64,'+Buffer.from('not image').toString('base64')));
 assert.throws(()=>decodeDetailUpload('x'.repeat(28*1024*1024+1)));
 assert.throws(()=>decodeDetailUpload('data:image/svg+xml;base64,AAAA'));
});
test('preserves JPEG source bytes',()=>{
 const bytes=Buffer.from([255,216,255,224,1,2,3]);
 const result=decodeDetailUpload('data:image/jpeg;base64,'+bytes.toString('base64'));
 assert.equal(result.ext,'.jpg');assert.deepEqual(result.buffer,bytes);
});
