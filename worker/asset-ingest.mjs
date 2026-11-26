import {validAssetCatalog} from './catalog-index.mjs';

const hashPattern=/^[a-f0-9]{64}$/;
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('')}
export async function ingestAssets(request,env,path){
 if(env.ATELIER_UPLOADS_ENABLED!=='true'||!env.ATELIER_INGEST_TOKEN||request.headers.get('X-Atelier-Ingest')!==env.ATELIER_INGEST_TOKEN)return reply({error:'Uploads are closed.'},403);
 try{
  if(path==='__ingest/check'&&request.method==='POST'){
   const hashes=await request.json();if(!Array.isArray(hashes)||hashes.length>1000||!hashes.every(hash=>typeof hash==='string'&&hashPattern.test(hash)))return reply({error:'Invalid object list.'},400);
   const missing=[];let cursor=0;await Promise.all(Array.from({length:Math.min(8,hashes.length)},async()=>{while(cursor<hashes.length){const hash=hashes[cursor++];if(!await env.BUCKET.head('blobs/'+hash))missing.push(hash)}}));return reply({missing});
  }
  if(path==='__ingest/batch'&&request.method==='PUT'){
   const data=new Uint8Array(await request.arrayBuffer());if(data.length<4||data.length>10*1024*1024)return reply({error:'Invalid batch size.'},400);
   const length=new DataView(data.buffer).getUint32(0,true);if(length>100000||length+4>data.length)return reply({error:'Invalid batch header.'},400);
   const entries=JSON.parse(new TextDecoder().decode(data.subarray(4,4+length)));if(!Array.isArray(entries)||entries.length>100)return reply({error:'Invalid batch.'},400);
   let offset=length+4;const pending=[];
   for(const entry of entries){if(!hashPattern.test(entry.sha256)||!Number.isInteger(entry.size)||entry.size<0||offset+entry.size>data.length)return reply({error:'Invalid object.'},400);const bytes=data.subarray(offset,offset+entry.size);if(await digest(bytes)!==entry.sha256)return reply({error:'Object checksum mismatch.'},400);pending.push([entry.sha256,bytes]);offset+=entry.size}
   if(offset!==data.length)return reply({error:'Unexpected batch bytes.'},400);
   let cursor=0;await Promise.all(Array.from({length:Math.min(8,pending.length)},async()=>{while(cursor<pending.length){const [hash,bytes]=pending[cursor++];await env.BUCKET.put('blobs/'+hash,bytes)}}));return reply({uploaded:pending.length});
  }
  if(path==='__ingest/asset-index.json'&&request.method==='PUT'){
   const compressed=request.headers.get('Content-Type')==='application/gzip';
   const bytes=compressed?await request.arrayBuffer():null;
   if(bytes&&bytes.byteLength>12*1024*1024)return reply({error:'Index too large.'},400);
   const body=compressed?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():await request.text();
   if(body.length>(compressed?36:25)*1024*1024)return reply({error:'Index too large.'},400);
   const index=JSON.parse(body);
   if(index.exportTarget!=='original'||index.exportFormat!=='standard_fantome_packed_wad'||!index.files||!Array.isArray(index.exportSkins))return reply({error:'Only original-skin export indexes are accepted.'},400);
   if(!validAssetCatalog(index))return reply({error:'Invalid resource index.'},400);
   if(compressed)await env.BUCKET.put('asset-index.json',bytes,{customMetadata:{encoding:'gzip'}});
   else await env.BUCKET.put('asset-index.json',body);
   return reply({activated:true});
  }
  return reply({error:'Unknown upload operation.'},404);
 }catch{return reply({error:'Invalid upload.'},400)}
}
