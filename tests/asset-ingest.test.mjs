import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {ingestAssets} from '../worker/asset-ingest.mjs';
import {makeApp,resetIndex} from '../worker/runtime.mjs';
import {compactAssetIndex} from '../worker/catalog-index.mjs';

test('asset migration requires an enabled maintenance window and the operator secret',async()=>{
 const request=()=>new Request('https://test/__ingest/check',{method:'POST',headers:{'X-Atelier-Ingest':'secret'},body:'[]'});
 assert.equal((await ingestAssets(request(),{ATELIER_INGEST_TOKEN:'secret'},'__ingest/check')).status,403);
 assert.equal((await ingestAssets(request(),{ATELIER_UPLOADS_ENABLED:'true',ATELIER_INGEST_TOKEN:'other'},'__ingest/check')).status,403);
});
test('migration verifies every hash before writing objects and refuses legacy export indexes',async()=>{
 const objects=new Map(),env={ATELIER_UPLOADS_ENABLED:'true',ATELIER_INGEST_TOKEN:'secret',BUCKET:{head:async key=>objects.has(key),put:async(key,data)=>objects.set(key,data)}},send=(path,body)=>ingestAssets(new Request('https://test/'+path,{method:'PUT',headers:{'X-Atelier-Ingest':'secret'},body}),env,path),payload=Buffer.from('native skin'),sha=createHash('sha256').update(payload).digest('hex'),header=Buffer.from(JSON.stringify([{sha256:sha,size:payload.length}])),length=Buffer.alloc(4);length.writeUInt32LE(header.length);
 assert.equal((await send('__ingest/batch',Buffer.concat([length,header,Buffer.from('wrong bytes')]))).status,400);assert.equal(objects.size,0);
 assert.equal((await send('__ingest/batch',Buffer.concat([length,header,payload]))).status,200);assert.equal(objects.size,1);
 assert.equal((await send('__ingest/asset-index.json',JSON.stringify({exportTarget:'base',files:{},exportSkins:[]}))).status,400);
 assert.equal((await send('__ingest/asset-index.json',JSON.stringify({exportTarget:'original',exportFormat:'standard_fantome_packed_wad',files:{},exportSkins:[]}))).status,200);
});

test('compact indexes keep hash checks and cannot redirect a resource to another object',async()=>{
 const env={ATELIER_UPLOADS_ENABLED:'true',ATELIER_INGEST_TOKEN:'secret',BUCKET:{put:async()=>{}}},sha='a'.repeat(64),index={exportTarget:'original',exportFormat:'standard_fantome_packed_wad',exportSkins:[],files:{'skins/ksante-0.json':{sha256:sha}}},send=()=>ingestAssets(new Request('https://test/__ingest/asset-index.json',{method:'PUT',headers:{'X-Atelier-Ingest':'secret'},body:JSON.stringify(index)}),env,'__ingest/asset-index.json');
 assert.equal((await send()).status,200);index.files['skins/ksante-0.json'].blob='blobs/'+'b'.repeat(64);assert.equal((await send()).status,400);delete index.files['skins/ksante-0.json'].blob;index.files['skins/ksante-0.json'].sha256='invalid';assert.equal((await send()).status,400);
});

test('asset batches upload independent objects concurrently within a bounded limit',async()=>{
 let active=0,maximum=0;const objects=new Map(),payloads=Array.from({length:20},(_,i)=>Buffer.from('effect-'+i)),entries=payloads.map(data=>({sha256:createHash('sha256').update(data).digest('hex'),size:data.length})),header=Buffer.from(JSON.stringify(entries)),length=Buffer.alloc(4);length.writeUInt32LE(header.length);
 const env={ATELIER_UPLOADS_ENABLED:'true',ATELIER_INGEST_TOKEN:'secret',BUCKET:{async put(key,data){active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,1));objects.set(key,data);active--}}},response=await ingestAssets(new Request('https://test/__ingest/batch',{method:'PUT',headers:{'X-Atelier-Ingest':'secret'},body:Buffer.concat([length,header,...payloads])}),env,'__ingest/batch');
 assert.equal(response.status,200);assert.equal(objects.size,20);assert.equal(active,0);assert.ok(maximum>1&&maximum<=8);for(const [i,entry]of entries.entries())assert.deepEqual(objects.get('blobs/'+entry.sha256),new Uint8Array(payloads[i]));
});

test('resource checks return every missing hash with bounded parallel lookups',async()=>{
 let active=0,maximum=0;const hashes=Array.from({length:20},(_,i)=>i.toString(16).padStart(64,'0')),present=new Set(hashes.slice(0,7)),env={ATELIER_UPLOADS_ENABLED:'true',ATELIER_INGEST_TOKEN:'secret',BUCKET:{async head(key){active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return present.has(key.slice(6))?{}:null}}};
 const response=await ingestAssets(new Request('https://test/__ingest/check',{method:'POST',headers:{'X-Atelier-Ingest':'secret'},body:JSON.stringify(hashes)}),env,'__ingest/check');assert.equal(response.status,200);assert.deepEqual((await response.json()).missing.sort(),hashes.slice(7).sort());assert.equal(active,0);assert.ok(maximum>1&&maximum<=8);
});

test('a compressed asset index is validated and read by the published catalogue',async()=>{
 const objects=new Map();
 const env={ATELIER_UPLOADS_ENABLED:'true',ATELIER_INGEST_TOKEN:'secret',BUCKET:{
  async put(key,data,options){objects.set(key,{body:new Blob([data]).stream(),customMetadata:options?.customMetadata})},
  async get(key){return objects.get(key)}
 }};
 const app=makeApp({});
 const upload=value=>app.fetch(new Request('https://test/__ingest/asset-index.json',{method:'PUT',headers:{'X-Atelier-Ingest':'secret','Content-Type':'application/gzip'},body:gzipSync(JSON.stringify(value))}),env);
 const index={exportTarget:'original',exportFormat:'standard_fantome_packed_wad',files:{},exportSkins:[],skins:2132};
 resetIndex();
 assert.equal((await upload({...index,exportTarget:'base'})).status,400);
 assert.equal((await upload(index)).status,200);
 assert.equal(objects.get('asset-index.json').customMetadata.encoding,'gzip');
 assert.equal((await(await app.fetch(new Request('https://test/api/status'),env)).json()).skins,2132);
});

test('the compact catalogue opens original skin definitions and rejects invalid entries',async()=>{
 const objects=new Map();
 const env={ATELIER_UPLOADS_ENABLED:'true',ATELIER_INGEST_TOKEN:'secret',BUCKET:{
  async put(key,data,options){objects.set(key,{data,customMetadata:options?.customMetadata})},
  async get(key){const value=objects.get(key);return value?{body:new Blob([value.data]).stream(),customMetadata:value.customMetadata}:null}
 }};
 const sha='a'.repeat(64),skin={id:'test-5',nativeParts:{revision:'original'}};
 objects.set('blobs/'+sha,{data:gzipSync(JSON.stringify(skin))});
 const old={exportTarget:'original',exportFormat:'standard_fantome_packed_wad',files:{'skins/test-5.json':{sha256:sha,contentType:'application/json; charset=utf-8',contentEncoding:'gzip'},'exports/test-5.json':{sha256:sha}},exportSkins:['test-5']};
 const app=makeApp({}),url='https://test/',compact=compactAssetIndex(old);
 const upload=value=>app.fetch(new Request(url+'__ingest/asset-index.json',{method:'PUT',headers:{'X-Atelier-Ingest':'secret','Content-Type':'application/gzip'},body:gzipSync(JSON.stringify(value))}),env);
 resetIndex();
 assert.equal((await upload(compact)).status,200);
 const wireResponse=await app.fetch(new Request(url+'skins/test-5.json'),env);
 assert.equal(wireResponse.headers.get('ETag'),'"'+sha+'"');
 assert.deepEqual(await wireResponse.json(),skin);
 assert.equal((await(await app.fetch(new Request(url+'api/skins/test-5'),env)).json()).skin.exportPolicy.canExport,true);
 assert.equal((await upload({...compact,files:{'skins/test-5.json':[sha,500,1]}})).status,400);
});
