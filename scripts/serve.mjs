import http from 'node:http';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {makeApp} from '../worker/runtime.mjs';

const root=path.resolve(import.meta.dirname,'..');
const web=path.join(root,'web');
const assets=process.env.ATELIER_ASSETS_DIR?path.resolve(process.env.ATELIER_ASSETS_DIR):path.join(root,'.atelier-assets');
const objects=path.join(assets,'objects');
const port=Number(process.env.ATELIER_PORT??8789);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('ATELIER_PORT must be a TCP port between 1 and 65535.');
if(!await stat(objects).then(item=>item.isDirectory()).catch(()=>false)){
 console.error('The local catalogue is missing. Run npm run assets:install.');
 process.exit(1);
}
if(!process.env.ATELIER_ASSETS_DIR&&!await stat(path.join(assets,'installed.json')).then(item=>item.isFile()).catch(()=>false)){
 console.error('The local catalogue is incomplete. Run npm run assets:install.');
 process.exit(1);
}

const types=new Map([
 ['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],
 ['.mjs','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],
 ['.txt','text/plain; charset=utf-8'],['.webp','image/webp'],['.woff2','font/woff2'],
]);
const pages=Object.create(null);
for(const prefix of ['','vendor/']){
 const directory=path.join(web,prefix);
 for(const item of await readdir(directory,{withFileTypes:true})){
  const contentType=types.get(path.extname(item.name));
  if(!item.isFile()||!contentType)continue;
  const content=await readFile(path.join(directory,item.name));
  const binary=/^(image|font)\//.test(contentType);
  pages[prefix+item.name]={contentType,binary,body:content.toString(binary?'base64':'utf8'),
                         etag:createHash('sha256').update(content).digest('hex')};
 }
}

const snapshot=await readFile(path.join(root,'data/catalog.json.gz'));
const bucket={async get(key){
 if(key==='asset-index.json')return {body:new Response(snapshot).body,customMetadata:{encoding:'gzip'}};
 const match=/^blobs\/([a-f0-9]{64})$/.exec(key);
 if(!match)return null;
 const filename=path.join(objects,match[1]);
 try{
  if(!(await stat(filename)).isFile())return null;
  return {get body(){return Readable.toWeb(createReadStream(filename))}};
 }catch(error){
  if(error.code==='ENOENT')return null;
  throw error;
 }
}};
const app=makeApp(pages);
const address='http://127.0.0.1:'+port;
http.createServer(async(request,response)=>{
 try{
  const pathname=request.url??'/';
  if(!pathname.startsWith('/')||pathname.startsWith('//')){
   response.writeHead(400).end();
   return;
  }
  const options={method:request.method,headers:request.headers};
  if(!['GET','HEAD'].includes(request.method)){
   options.body=Readable.toWeb(request);
   options.duplex='half';
  }
  const result=await app.fetch(new Request(address+pathname,options),{BUCKET:bucket});
  response.writeHead(result.status,Object.fromEntries(result.headers));
  if(result.body)await pipeline(Readable.fromWeb(result.body),response);
  else response.end();
 }catch(error){
  if(!response.headersSent)response.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});
  if(!response.destroyed)response.end('Could not serve this local resource.');
  if(error.code!=='ERR_STREAM_PREMATURE_CLOSE')console.error(error.message);
 }
}).listen(port,'127.0.0.1',()=>console.log('Atelier is running at '+address+'/pieces.html'));
