import {xxhash3} from './xxhash3-vendor.mjs';
import {xxhash64} from './xxhash64-vendor.mjs';

export async function packWad(resources){
 const chunks=[],hashes=new Set();
 for(const [path,input] of resources){
  if(typeof path!=='string'||path.startsWith('/')||path.includes('\\')||path.split('/').some(part=>!part||part==='..'))throw Error('Invalid WAD resource path.');
  const hash=BigInt('0x'+await xxhash64(path.toLowerCase()));if(hashes.has(hash))throw Error('Duplicate WAD resource.');hashes.add(hash);
  const data=input instanceof Uint8Array?input:new Uint8Array(input),packed=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  chunks.push({hash,data:packed,length:data.length,checksum:BigInt('0x'+await xxhash3(packed))});
 }
 chunks.sort((a,b)=>a.hash<b.hash?-1:a.hash>b.hash?1:0);
 let offset=272+chunks.length*32;const total=offset+chunks.reduce((sum,chunk)=>sum+chunk.data.length,0);if(total>0xffffffff)throw Error('This export is too large.');
 const output=new Uint8Array(total),view=new DataView(output.buffer);output.set([82,87,3,4]);view.setUint32(268,chunks.length,true);
 for(let i=0;i<chunks.length;i++){
  const chunk=chunks[i],at=272+i*32;view.setBigUint64(at,chunk.hash,true);view.setUint32(at+8,offset,true);view.setUint32(at+12,chunk.data.length,true);view.setUint32(at+16,chunk.length,true);view.setUint8(at+20,1);view.setBigUint64(at+24,chunk.checksum,true);output.set(chunk.data,offset);offset+=chunk.data.length;
 }
 return output;
}
