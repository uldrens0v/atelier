import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,open,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {gunzipSync} from 'node:zlib';

const root=path.resolve(import.meta.dirname,'..');
const assets=process.env.ATELIER_ASSETS_DIR?path.resolve(process.env.ATELIER_ASSETS_DIR):path.join(root,'.atelier-assets');
const objects=path.join(assets,'objects');
const args=process.argv.slice(2);
const from=args[0]==='--from'&&args.length===2?path.resolve(args[1]):null;
if(args.length&&!from)throw Error('Usage: npm run assets:install -- [--from DIRECTORY]');
const downloads=from??path.join(assets,'downloads');
const release=JSON.parse(await readFile(path.join(root,'data/release.json'),'utf8'));
const catalogue=JSON.parse(gunzipSync(await readFile(path.join(root,'data/catalog.json.gz'))));
const ids=new Set(Object.values(catalogue.files).map(record=>record[0]));
const digestPattern=/^[a-f0-9]{64}$/;

async function download(name,destination,part){
 const url=`https://github.com/${release.repository}/releases/download/${encodeURIComponent(release.release)}/${encodeURIComponent(name)}`;
 console.log('Downloading '+name+'…');
 const response=await fetch(url);
 if(!response.ok||!response.body){
  await response.body?.cancel();
  throw Error(`GitHub could not download ${name} (HTTP ${response.status}). You can also download the release files and run the installer with --from.`);
 }
 const staging=destination+'.partial-'+randomUUID();
 try{
  await pipeline(response.body,createWriteStream(staging,{flags:'wx'}));
  if(part&&((await stat(staging)).size!==part.size||await checksum(staging)!==part.sha256)){
   throw Error('Download failed integrity checks: '+name);
  }
  await rename(staging,destination);
 }catch(error){
  await rm(staging,{force:true}).catch(()=>{});
  throw error;
 }
}
async function checksum(filename){
 const hash=createHash('sha256');
 for await(const piece of createReadStream(filename))hash.update(piece);
 return hash.digest('hex');
}
async function exists(filename){
 try{return (await stat(filename)).isFile()}catch(error){if(error.code==='ENOENT')return false;throw error}
}
async function exact(file,length,position){
 const buffer=Buffer.allocUnsafe(length);
 let offset=0;
 while(offset<length){
  const {bytesRead}=await file.read(buffer,offset,length-offset,position+offset);
  if(!bytesRead)throw Error('The asset archive ended unexpectedly.');
  offset+=bytesRead;
 }
 return buffer;
}
async function unpack(filename,part,expected){
 const archive=await open(filename,'r');
 let offset=0,count=0;
 try{
  while(offset+512<=part.size){
   const header=await exact(archive,512,offset);
   if(header.every(value=>value===0))break;
   const name=header.toString('ascii',0,100).replace(/\0.*$/s,'');
   const value=/^objects\/([a-f0-9]{64})$/.exec(name);
   const octal=header.toString('ascii',124,136).replace(/\0/g,'').trim();
   const length=/^[0-7]+$/.test(octal)?Number.parseInt(octal,8):0;
   if(!value||value[1]!==expected[count]||![0,48].includes(header[156])||length<1||
      length>100*1024**2||offset+512+length>part.size)throw Error('Invalid archive entry.');
   const contents=await exact(archive,length,offset+512);
   if(createHash('sha256').update(contents).digest('hex')!==value[1])throw Error('Corrupt asset '+value[1]);
   const destination=path.join(objects,value[1]);
   if(await exists(destination)){
    if(await checksum(destination)!==value[1])throw Error('Corrupt local asset '+value[1]+'. Move that file aside and retry.');
   }else{
    const staging=path.join(assets,'pending-'+randomUUID());
    await writeFile(staging,contents,{flag:'wx'});
    await rename(staging,destination);
   }
   offset+=512+Math.ceil(length/512)*512;
   count++;
  }
 }finally{await archive.close()}
 if(count!==part.objects)throw Error('Wrong number of objects in '+part.name);
}

async function install(){
 await mkdir(objects,{recursive:true});
 if(!from)await mkdir(downloads,{recursive:true});
 const manifestPath=path.join(downloads,'asset-bundle.json');
 if(!from&&!await exists(manifestPath))await download('asset-bundle.json',manifestPath);
 const bundle=JSON.parse(await readFile(manifestPath,'utf8'));
 if(bundle.repository!==release.repository||bundle.release!==release.release||
    !Array.isArray(bundle.chunks)||bundle.objectCount!==ids.size||
    new Set(bundle.chunks.map(part=>part.name)).size!==bundle.chunks.length||
    bundle.chunks.some(part=>!/^atelier-assets-\d\d-of-\d\d\.tar$/.test(part.name)||!digestPattern.test(part.sha256)||
     !Number.isSafeInteger(part.objects)||part.objects<1||!Number.isSafeInteger(part.size)||part.size<=0||part.size>=2*1024**3)||
    bundle.chunks.reduce((count,part)=>count+part.objects,0)!==ids.size){
  throw Error('This bundle does not match the packaged catalogue.');
 }
 const expected=[...ids];
 let offset=0;
 for(const part of bundle.chunks){
  const sequence=expected.slice(offset,offset+part.objects);
  offset+=part.objects;
  const stamp=path.join(assets,part.name+'.installed');
  if(await exists(stamp)&&(await readFile(stamp,'utf8')).trim()===part.sha256)continue;
  const filename=path.join(downloads,part.name);
  if(!from&&!await exists(filename)){
   await download(part.name,filename,part);
  }else if((await stat(filename)).size!==part.size||await checksum(filename)!==part.sha256){
   throw Error('Archive checksum mismatch: '+filename);
  }
  console.log('Installing '+part.name+'…');
  await unpack(filename,part,sequence);
  await writeFile(stamp,part.sha256+'\n');
 }
 await writeFile(path.join(assets,'installed.json'),JSON.stringify(release)+'\n');
 console.log('Catalogue ready. Run npm start.');
}

install().catch(error=>{
 console.error(error.message);
 process.exitCode=1;
});
