import {ingestAssets} from './asset-ingest.mjs';
import {readAssetInfo} from './catalog-index.mjs';
let catalogPromise;
let catalogLoadedAt=0;

function reply(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}})}
async function jsonObject(object){
 const body=object.customMetadata?.encoding==='gzip'?object.body.pipeThrough(new DecompressionStream('gzip')):object.body;
 return JSON.parse(await new Response(body).text());
}
async function index(env){
 if(!catalogPromise||Date.now()-catalogLoadedAt>60000){catalogLoadedAt=Date.now();catalogPromise=env.BUCKET.get('asset-index.json').then(object=>object?jsonObject(object):null).catch(error=>{catalogPromise=null;throw error})}
 const value=await catalogPromise;if(!value)catalogPromise=null;return value;
}
export function resetIndex(){catalogPromise=null}

export function makeApp(pages){return{async fetch(request,env){
 const url=new URL(request.url);
 const path=decodeURIComponent(url.pathname).replace(/^\/+/, '');
 if(path.startsWith('__ingest/')){const response=await ingestAssets(request,env,path);if(response.ok&&path==='__ingest/asset-index.json')resetIndex();return response}
 if(request.method==='GET'&&path==='api/status'){
  const data=env.BUCKET?await index(env):null;return reply({ready:!!data,champions:data?.champions??0,skins:data?.skins??0,exportMode:data?.exportMode??'palette_download',exportSkins:data?.exportSkins?.length??0,projectiles:data?.projectiles??null});
 }
 if(request.method==='GET'&&/^api\/skins\/\w+-\d+$/.test(path)){
  try{
   const id=path.slice(10),data=await index(env),info=readAssetInfo(data,'skins/'+id+'.json');if(!info)return reply({error:'This skin is not available.'},404);
   const canExport=data.exportTarget==='original'&&!!data.files['exports/'+id+'.json'],headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=60','ETag':'"'+info.sha256+'-'+Number(canExport)+'"'};
   if(request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
   const object=await env.BUCKET.get(info.blob??'blobs/'+info.sha256);if(!object)return reply({error:'The skin is loading. Please try again.'},503);
   const body=info.contentEncoding==='gzip'?object.body.pipeThrough(new DecompressionStream('gzip')):object.body,skin=await new Response(body).json();skin.exportPolicy={canExport,canDownloadPalette:true};
   return new Response(JSON.stringify({skin}),{headers});
  }catch{return reply({error:'Could not load the skin. Please try again.'},503)}
 }
 if(request.method==='POST'&&path==='api/export'){
  try{
   const payload=await request.json();if(!['prepare','prepare_mesh'].includes(payload.action))return reply({error:'Use the 3D editor to download the .fantome.'},400);
   if(typeof payload.skinId!=='string'||!/^\w+-\d+$/.test(payload.skinId))return reply({error:'Invalid skin.'},400);
   const data=await index(env);const info=readAssetInfo(data,'skins/'+payload.skinId+'.json');if(!info)return reply({error:'This skin is not available.'},404);
   const object=await env.BUCKET.get(info.blob??'blobs/'+info.sha256);if(!object)return reply({error:'The skin is loading. Please try again.'},503);
   let stream=object.body;if(info.contentEncoding==='gzip')stream=stream.pipeThrough(new DecompressionStream('gzip'));
   const skin=JSON.parse(await new Response(stream).text());
   skin.exportPolicy={canExport:data.exportTarget==='original'&&!!data.files['exports/'+skin.id+'.json'],canDownloadPalette:true};
   if(payload.revision&&skin.nativeParts.revision!==payload.revision)return reply({error:'This skin revision is no longer available.'},400);
   return reply({skin});
  }catch{return reply({error:'Could not load the skin. Please try again.'},400)}
 }
 if(request.method!=='GET'&&request.method!=='HEAD')return reply({error:'Method not allowed.'},405);
 const page=pages[path||'index.html'];
 if(page){
  if(page.binary&&url.searchParams.has('v')&&url.searchParams.get('v')!==page.etag)return reply({error:'This image version has changed.'},409);
  const headers={'Content-Type':page.contentType,'Cache-Control':page.binary&&url.searchParams.get('v')===page.etag?'private, max-age=31536000, immutable':'private, no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...(page.etag?{'ETag':'"'+page.etag+'"'}:{})};
  if(headers.ETag&&request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
  return new Response(request.method==='HEAD'?null:page.binary?Uint8Array.from(atob(page.body),c=>c.charCodeAt(0)):page.body,{headers});
 }
 const data=env.BUCKET?await index(env):null;const info=readAssetInfo(data,path);
 if(!info)return reply({error:data?'Resource unavailable.':'The catalogue is loading. Please try again.'},data?404:503);
 const object=await env.BUCKET.get(info.blob??'blobs/'+info.sha256);if(!object)return reply({error:'Resource not yet available.'},503);
 const headers={'Content-Type':info.contentType,'Cache-Control':'private, max-age=3600','ETag':'"'+info.sha256+'"','X-Content-Type-Options':'nosniff'};
 if(request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
 const body=request.method==='HEAD'?null:info.contentEncoding==='gzip'?object.body.pipeThrough(new DecompressionStream('gzip')):object.body;
 return new Response(body,{headers});
}}}
