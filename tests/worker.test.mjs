import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {makeApp,resetIndex} from '../worker/runtime.mjs';

const values=new Map();
const bucket={async get(key){const value=values.get(key);return value?{body:new Blob([value]).stream(),customMetadata:{}}:null},async head(key){return values.has(key)?{}:null},async put(key,value){values.set(key,new Uint8Array(value))}};
const env={BUCKET:bucket,ATELIER_INGEST_TOKEN:'test-secret'};
const app=makeApp({'index.html':{body:'private editor',contentType:'text/html'}});
test('known frontend is served and arbitrary server files are not exposed',async()=>{
 resetIndex();values.clear();assert.equal(await(await app.fetch(new Request('https://test/'),env)).text(),'private editor');assert.equal((await app.fetch(new Request('https://test/server.py'),env)).status,503);
});
test('skin preparation resolves gzipped metadata and enables export only with hosted resources',async()=>{
 resetIndex();values.clear();const data={id:'amumu-0',nativeParts:{revision:'abc'},exportPolicy:{canExport:false,canDownloadPalette:true}};
 values.set('asset-index.json',new TextEncoder().encode(JSON.stringify({champions:173,skins:2132,files:{'skins/amumu-0.json':{blob:'blobs/skin',contentEncoding:'gzip'}}})));
 values.set('blobs/skin',gzipSync(JSON.stringify(data)));
 const response=await app.fetch(new Request('https://test/api/export',{method:'POST',body:JSON.stringify({action:'prepare_mesh',skinId:'amumu-0'})}),env);assert.deepEqual((await response.json()).skin,data);
 assert.equal((await app.fetch(new Request('https://test/api/export',{method:'POST',body:'{"skin":"amumu-0"}'}),env)).status,400);
});
test('compressed assets are decoded once before platform compression and stay private',async()=>{
 resetIndex();values.clear();values.set('asset-index.json',new TextEncoder().encode(JSON.stringify({files:{'assets/example.json':{blob:'blobs/json',contentType:'application/json',contentEncoding:'gzip',sha256:'hash'}}})));values.set('blobs/json',gzipSync('{"ok":true}'));
 const response=await app.fetch(new Request('https://test/assets/example.json'),env);assert.equal(response.headers.get('Content-Encoding'),null);assert.deepEqual(await response.json(),{ok:true});assert.ok(response.headers.get('Cache-Control').startsWith('private'));
});
test('resource ingestion remains closed even with the previous secret',async()=>{
 for(const method of ['GET','HEAD','PUT','POST']){
  const response=await app.fetch(new Request('https://test/__ingest/blobs/'+'a'.repeat(64),{method,headers:{'X-Atelier-Ingest':'test-secret'}}),env);assert.equal(response.status,403);
 }
});

test('versioned icon sheets serve exact binary data, conditional requests and detect outdated maps',async()=>{
 const icons=makeApp({'icons.webp':{body:btoa('RIFF\u0000\u00ffWEBP'),contentType:'image/webp',binary:true,etag:'abc'}}),response=await icons.fetch(new Request('https://test/icons.webp?v=abc'),env);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),Uint8Array.from('RIFF\u0000\u00ffWEBP',c=>c.charCodeAt(0)));assert.match(response.headers.get('Cache-Control'),/private.*immutable/);
 assert.equal((await icons.fetch(new Request('https://test/icons.webp?v=abc',{headers:{'If-None-Match':'"abc"'}}),env)).status,304);assert.equal((await icons.fetch(new Request('https://test/icons.webp?v=old'),env)).status,409);
});

test('cacheable skin metadata preserves export checks and avoids redundant object reads',async()=>{
 resetIndex();values.clear();values.set('asset-index.json',new TextEncoder().encode(JSON.stringify({exportTarget:'original',files:{'skins/amumu-0.json':{blob:'blobs/skin',contentEncoding:'gzip',sha256:'skin-hash'},'exports/amumu-0.json':{}}})));values.set('blobs/skin',gzipSync(JSON.stringify({id:'amumu-0',nativeParts:{revision:'abc'}})));
 const response=await app.fetch(new Request('https://test/api/skins/amumu-0'),env);assert.equal((await response.json()).skin.exportPolicy.canExport,true);assert.match(response.headers.get('Cache-Control'),/private/);assert.equal((await app.fetch(new Request('https://test/api/skins/amumu-0',{headers:{'If-None-Match':response.headers.get('ETag')}}),env)).status,304);assert.equal((await app.fetch(new Request('https://test/api/skins/amumu-99'),env)).status,404);
});

test('a legacy Classic export index cannot enable downloads',async()=>{
 resetIndex();values.clear();values.set('asset-index.json',new TextEncoder().encode(JSON.stringify({files:{'skins/test-7.json':{blob:'blobs/skin'},'exports/test-7.json':{}}})));values.set('blobs/skin',new TextEncoder().encode(JSON.stringify({id:'test-7'})));
 const response=await app.fetch(new Request('https://test/api/skins/test-7'),env);assert.equal((await response.json()).skin.exportPolicy.canExport,false);
});

test('compact catalogue entries resolve skin APIs and resources from their verified hash',async()=>{
 resetIndex();values.clear();const hash='a'.repeat(64),skin={id:'ksante-0',nativeParts:{revision:'abc'}};
 values.set('asset-index.json',JSON.stringify({exportTarget:'original',files:{'skins/ksante-0.json':{sha256:hash,contentEncoding:'gzip',contentType:'application/json'},'exports/ksante-0.json':{}}}));values.set('blobs/'+hash,gzipSync(JSON.stringify(skin)));
 assert.equal((await(await app.fetch(new Request('https://test/api/skins/ksante-0'),env)).json()).skin.exportPolicy.canExport,true);
 assert.equal((await(await app.fetch(new Request('https://test/api/export',{method:'POST',body:JSON.stringify({action:'prepare_mesh',skinId:'ksante-0'})}),env)).json()).skin.id,'ksante-0');
 assert.deepEqual(await(await app.fetch(new Request('https://test/skins/ksante-0.json'),env)).json(),skin);
});
