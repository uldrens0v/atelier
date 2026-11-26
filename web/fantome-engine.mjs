import {applyAbilityColours,applyAbilityTextureBindings,abilityTexturePixels,migrateAbilityVfx,validateAbilityVfx} from './ability-colour.mjs';
import {SKIN_NAMES} from './catalog-data.mjs';
import {decodeMaskPng,validateMask} from './mask-data.mjs';
import {materialCache,materialPixels} from './material-engine.mjs';
import {composePaint} from './paint-engine.mjs';
import {EXPORT_LEGAL_NOTICE} from './legal-notice.mjs';
import {packWad} from './wad-writer.mjs';
import {fullMaterialPixels,finishVector,validateFinish,preserveDetail,hexRgb,semanticLabels} from './detail-colour.mjs';
import {validatePartFinishes,preparePartFinish,finishPartColour} from './part-finish.mjs';
import {customExportName,defaultExportName,exportFilename} from './export-name.mjs';

const utf8=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0});
function crc32(bytes){let crc=0xffffffff;for(const value of bytes)crc=(crc>>>8)^crcTable[(crc^value)&255];return(crc^0xffffffff)>>>0}
const json=value=>utf8.encode(JSON.stringify(value,null,2));
const color=value=>[1,3,5].map(index=>parseInt(value.slice(index,index+2),16)/255);
const bytes=value=>value instanceof Uint8Array?value:new Uint8Array(value);
const safePath=value=>typeof value==='string'&&!value.startsWith('/')&&!value.includes('\\')&&!value.split('/').some(part=>part==='..'||part==='');
async function sha256(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(v=>v.toString(16).padStart(2,'0')).join('')}

export class FantomeZip{
 constructor(){this.parts=[];this.directory=[];this.offset=0}
 async add(path,input,{store=false}={}){
  if(!safePath(path))throw Error('Invalid package path.');
  const data=input instanceof Blob?new Uint8Array(await input.arrayBuffer()):bytes(input),name=utf8.encode(path);
  const packed=store?data:new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const compressed=store?packed:packed.subarray(2,packed.length-4),method=store?0:8,crc=crc32(data),header=new Uint8Array(30+name.length),view=new DataView(header.buffer);
  view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(8,method,true);view.setUint16(12,0x5d62,true);view.setUint32(14,crc,true);view.setUint32(18,compressed.length,true);view.setUint32(22,data.length,true);view.setUint16(26,name.length,true);header.set(name,30);
  this.parts.push(header,compressed);this.directory.push({name,crc,method,size:data.length,compressed:compressed.length,offset:this.offset});this.offset+=header.length+compressed.length;
 }
 finish(){
  const start=this.offset;
  for(const item of this.directory){
   const header=new Uint8Array(46+item.name.length),view=new DataView(header.buffer);
   view.setUint32(0,0x02014b50,true);view.setUint16(4,20,true);view.setUint16(6,20,true);view.setUint16(8,0x800,true);view.setUint16(10,item.method,true);view.setUint16(14,0x5d62,true);view.setUint32(16,item.crc,true);view.setUint32(20,item.compressed,true);view.setUint32(24,item.size,true);view.setUint16(28,item.name.length,true);view.setUint32(42,item.offset,true);header.set(item.name,46);this.parts.push(header);this.offset+=header.length;
  }
  const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,this.directory.length,true);view.setUint16(10,this.directory.length,true);view.setUint32(12,this.offset-start,true);view.setUint32(16,start,true);this.parts.push(end);return new Blob(this.parts,{type:'application/octet-stream'});
 }
}

const resizeKernels=new Map();
function boxKernel(size,target){
 const key=size+':'+target;if(resizeKernels.has(key))return resizeKernels.get(key);
 const scale=size/target,support=Math.max(1,scale)*.5,inverse=1/Math.max(1,scale),result=[];
 for(let x=0;x<target;x++){
  const center=(x+.5)*scale,begin=Math.max(0,Math.trunc(center-support+.5)),end=Math.min(size,Math.trunc(center+support+.5)),samples=[];
  for(let p=begin;p<end;p++){const distance=(p-center+.5)*inverse;if(distance>-.5&&distance<=.5)samples.push(p)}
  result.push(samples);
 }
 resizeKernels.set(key,result);return result;
}
export function resizeDelta(delta,width,height,targetWidth,targetHeight){
 if(width===targetWidth&&height===targetHeight)return delta;
 const horizontal=new Float32Array(targetWidth*height*3),out=new Float32Array(targetWidth*targetHeight*3),kernelX=boxKernel(width,targetWidth),kernelY=boxKernel(height,targetHeight);
 for(let y=0;y<height;y++)for(let x=0;x<targetWidth;x++){
  const samples=kernelX[x],weight=1/samples.length;
  for(let channel=0;channel<3;channel++){let sum=0;for(const source of samples)sum+=delta[(y*width+source)*3+channel]*weight;horizontal[(y*targetWidth+x)*3+channel]=sum}
 }
 for(let y=0;y<targetHeight;y++)for(let x=0;x<targetWidth;x++){
  const samples=kernelY[y],weight=1/samples.length;
  for(let channel=0;channel<3;channel++){let sum=0;for(const source of samples)sum+=horizontal[(source*targetWidth+x)*3+channel]*weight;out[(y*targetWidth+x)*3+channel]=sum}
 }
 return out;
}

export function encodeTexture(texture,original,mask,palette,zones){
 const base=texture.levels.find(level=>level.level===0);if(!base||original.length!==texture.byteLength)throw Error('Texture mip levels are incomplete.');
 const pixels=original.subarray(base.offset,base.offset+base.length),cache=materialCache(pixels,mask,{...zones,profiles:texture.profiles,maskEncoding:texture.maskEncoding});
 cache.luminance=Float64Array.from({length:pixels.length/4},(_,index)=>(.2126*pixels[index*4]+.7152*pixels[index*4+1]+.0722*pixels[index*4+2])/255);
 let changed=materialPixels(pixels,palette,cache,{colourMode:zones.colourMode,finish:zones.finish,texture:texture.finish,partFinishes:zones.partFinishes});if(zones.paint)changed=composePaint(changed,zones.paint,texture.width,texture.height);return encodeChangedTexture(texture,original,changed);
}

export function encodeChangedTexture(texture,original,changed){
 const base=texture.levels.find(level=>level.level===0),pixels=original.subarray(base.offset,base.offset+base.length),delta=new Float32Array(pixels.length/4*3);
 for(let p=0;p<pixels.length/4;p++){if(changed[p*4+3]!==pixels[p*4+3])throw Error('Texture transparency changed.');for(let channel=0;channel<3;channel++)delta[p*3+channel]=changed[p*4+channel]-pixels[p*4+channel]}
 const output=new Uint8Array(12+original.length);output.set(texture.header);
 for(const level of texture.levels){
  const adjustment=resizeDelta(delta,texture.width,texture.height,level.width,level.height);
  for(let p=0;p<level.length/4;p++){
   const source=level.offset+p*4,dest=12+source;
   output[dest]=Math.max(0,Math.min(255,Math.floor(original[source+2]+adjustment[p*3+2]+.5)));
   output[dest+1]=Math.max(0,Math.min(255,Math.floor(original[source+1]+adjustment[p*3+1]+.5)));
   output[dest+2]=Math.max(0,Math.min(255,Math.floor(original[source]+adjustment[p*3]+.5)));
   output[dest+3]=original[source+3];
  }
 }
 return output;
}

export function recolorEffects(input,slots,tint,options={}){
 const result=new Uint8Array(input),view=new DataView(result.buffer),target=color(tint);
 for(const slot of slots){if(!Number.isInteger(slot.offset)||slot.offset<0||slot.offset+(slot.format==='u8'?3:12)>result.length)throw Error('Invalid effect reference.');const source=[0,1,2].map(c=>slot.format==='u8'?result[slot.offset+c]:view.getFloat32(slot.offset+c*4,true)),preserved=options.colourMode==='preserve'?finishVector(source,'normal',{normalColor:tint,saturation:1}):null;for(let c=0;c<3;c++){if(slot.format==='u8')result[slot.offset+c]=Math.floor((preserved?preserved[c]:Math.fround(Math.fround(target[c])*Math.fround(slot.maximum)))+.5);else if(slot.format==='f32')view.setFloat32(slot.offset+c*4,Math.fround(preserved?preserved[c]:Math.fround(target[c])*Math.fround(slot.maximum)),true);else throw Error('Invalid effect format.')}}
 return result;
}

export function recolorMaterialParameters(input,slots,palette,anchors,options={}){
 const result=new Uint8Array(input),view=new DataView(result.buffer,result.byteOffset,result.byteLength);
 for(const slot of slots??[]){
  if(!Number.isInteger(slot.zone)||slot.zone<0||slot.zone>=palette.length||!Number.isInteger(slot.offset)||slot.offset<0||slot.offset+16>result.length||!Number.isFinite(slot.maximum)||slot.maximum<0||slot.rgba?.length!==4)throw Error('Invalid material colour reference.');
  for(let channel=0;channel<4;channel++)if(view.getFloat32(slot.offset+channel*4,true)!==Math.fround(slot.rgba[channel]))throw Error('The material colour does not match this skin.');
  const same=palette[slot.zone].toLowerCase()===anchors[slot.zone].toLowerCase(),settings=options.partFinishes?.[slot.zone],part=settings?preparePartFinish(settings):null;if(same&&(!part||!part.graded))continue;const maximum=slot.maximum||1,source=slot.rgba.slice(0,3).map(v=>v/maximum);
  let target=same?source:options.colourMode==='preserve'?preserveDetail(source,hexRgb(anchors[slot.zone]),color(palette[slot.zone])):color(palette[slot.zone]);if(part)target=finishPartColour(target,source,source,null,part);for(let channel=0;channel<3;channel++)view.setFloat32(slot.offset+channel*4,Math.fround(target[channel]*maximum),true);
 }
 return result;
}

export function recolorFinishParameters(input,profile,finish){
 validateFinish(finish,profile);const result=new Uint8Array(input);if(!finish)return result;const view=new DataView(result.buffer);
 for(const slot of profile.slots){
  if(slot.role==='vfx'&&finish.effects===false)continue;const byte=slot.format==='u8',size=byte?4:16;if(!Number.isInteger(slot.offset)||slot.offset<0||slot.offset+size>result.length||slot.rgba.length!==4)throw Error('Invalid full material reference.');
  for(let c=0;c<4;c++)if((byte?result[slot.offset+c]:view.getFloat32(slot.offset+c*4,true))!==(byte?slot.rgba[c]:Math.fround(slot.rgba[c])))throw Error('The full material does not match this skin.');
  const rgb=finishVector(slot.rgba.slice(0,3),slot.state,finish);for(let c=0;c<3;c++)if(byte)result[slot.offset+c]=Math.floor(rgb[c]+.5);else view.setFloat32(slot.offset+c*4,rgb[c],true);
 }
 return result;
}

export function validateOriginalTarget(variant,raw){
 if(variant.version!==2||variant.target!=='original'||!Number.isInteger(variant.skin)||variant.skin<0||variant.sourceValidation?.sourceIdentityVerified!==true||variant.sourceValidation.skin!==variant.skin)throw Error('Original-skin export data is required. Reload the editor.');
 const expected='WAD/'+(variant.archiveChampion??variant.champion)+'.wad.client/data/characters/'+variant.champion.toLowerCase()+'/skins/skin'+variant.skin+'.bin';
 if(variant.source?.path!==expected)throw Error('The export must target the selected original skin.');
 if(!raw)return;
 const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),hash=value=>{let h=0x811c9dc5;for(const code of utf8.encode(value.toLowerCase()))h=Math.imul(h^code,0x1000193)>>>0;return h},root=hash('characters/'+variant.champion+'/skins/skin'+variant.skin),classic=hash('characters/'+variant.champion+'/skins/skin0');
 if(raw.length<16||new TextDecoder().decode(raw.subarray(0,4))!=='PROP')throw Error('Invalid original skin definition.');
 let offset=8;const version=view.getUint32(4,true);if(version>=2){const count=view.getUint32(offset,true);offset+=4;for(let i=0;i<count;i++){const length=view.getUint16(offset,true);offset+=2+length}}
 const count=view.getUint32(offset,true);offset+=4+count*4;let found=false;
 for(let i=0;i<count;i++){const length=view.getUint32(offset,true),id=view.getUint32(offset+4,true);if(variant.skin!==0&&id===classic)throw Error('Paid skins cannot replace Classic.');if(id===root)found=true;offset+=4+length;if(offset>raw.length)throw Error('Invalid original skin definition.');}
 if(!found||offset!==raw.length)throw Error('The skin definition does not match the selected original skin.');
}

export async function createFantome(descriptor,palette,{read,progress=()=>{},thumbnail=null}={}){
 validateOriginalTarget(descriptor);
 if(descriptor.id!==palette.skin||descriptor.revision!==palette.experimentVariant||JSON.stringify(descriptor.anchors)!==JSON.stringify(palette.anchors))throw Error('The chroma does not match this skin revision.');
 if(palette.method!=='material-zones-v1'||palette.target!=='original'||palette.targets.length!==descriptor.anchors.length||!palette.targets.every(value=>/^#[0-9a-f]{6}$/i.test(value))||!/^#[0-9a-f]{6}$/i.test(palette.energy)||Object.keys(palette.zoneAssignments??{}).length)throw Error('Invalid chroma data.');
 const fetchBytes=read??(async path=>{if(!safePath(path))throw Error('Invalid resource path.');const response=await fetch(new URL(path,import.meta.url),{credentials:'same-origin',cache:'no-cache'});if(!response.ok)throw Error('Could not download an export resource ('+response.status+').');return new Uint8Array(await response.arrayBuffer())});
 const zip=new FantomeZip(),archives=new Map();let textureCount=0;
 async function packVariant(variant,values,scope=''){
  values={...values,abilityVfx:migrateAbilityVfx(values.abilityVfx,variant.abilityVfx)};
  const prefix='WAD/'+(variant.archiveChampion??variant.champion)+'.wad.client/';
  validateOriginalTarget(variant);if(variant.skin!==descriptor.skin||(variant.archiveChampion??variant.champion)!==descriptor.champion)throw Error('The form must belong to the same original skin.');
  if(values.colourMode&&!['preserve','repaint'].includes(values.colourMode))throw Error('Invalid colour treatment.');validateFinish(values.finish,variant.fullMaterials);
  validatePartFinishes(values.partFinishes,variant.anchors.length);validateAbilityVfx(values.abilityVfx,variant.abilityVfx);
  if(!archives.has(prefix))archives.set(prefix,new Map());const resources=archives.get(prefix),addResource=(path,data)=>{const name=path.slice(prefix.length);if(resources.has(name))throw Error('Duplicate skin resource.');resources.set(name,data)};
  if(values.targets.length!==variant.anchors.length||JSON.stringify(values.anchors)!==JSON.stringify(variant.anchors)||!values.targets.every(value=>/^#[0-9a-f]{6}$/i.test(value))||!/^#[0-9a-f]{6}$/i.test(values.energy))throw Error('The form colours do not match its materials.');
  const allowed=new Set(variant.textures.map(texture=>texture.id));for(const id of Object.keys(values.paint??{}))if(!allowed.has(id))throw Error('Paint belongs to a different form.');
  progress('Preparing original skin…');const originalBase=bytes(await fetchBytes(variant.source.asset));if(await sha256(originalBase)!==variant.source.sha256)throw Error('The original skin data is incomplete.');validateOriginalTarget(variant,originalBase);
  const coloredBase=recolorMaterialParameters(originalBase,variant.materialColors,values.targets,variant.anchors,values),finishedBase=recolorFinishParameters(coloredBase,variant.fullMaterials,values.finish),base=values.effects&&(!values.finish||variant.fullMaterials.effectCoverage==='model_only')?recolorEffects(finishedBase,variant.source.effectSlots,values.energy,values):finishedBase,abilityBase=applyAbilityColours(base,variant.abilityVfx,values.abilityVfx,originalBase);addResource(variant.source.path,applyAbilityTextureBindings(abilityBase,variant.abilityVfx,values.abilityVfx,originalBase));
  async function originalTexture(texture){const original=new Uint8Array(texture.byteLength);let cursor=0;for(const part of texture.parts){const value=bytes(await fetchBytes(part));if(cursor+value.length>original.length)throw Error('Unexpected texture data.');original.set(value,cursor);cursor+=value.length}if(cursor!==original.length||await sha256(original)!==texture.originalRgbaSha256)throw Error('Could not verify the original texture.');return original}
  async function materialTexture(texture){const semantic=texture.finish?.semantic;if(!semantic||!values.finish)return texture;if(!safePath(semantic.mask))throw Error('Invalid material colour map.');const mask=await decodeMaskPng(bytes(await fetchBytes(semantic.mask)));validateMask(mask,texture.width,texture.height,semantic.maskEncoding,semantic.channelIds.length);return{...texture,finish:{...texture.finish,semantic:{...semantic,labels:semanticLabels(mask.pixels,semantic.maskEncoding,semantic.channelIds.length)}}}}
  for(let index=0;index<variant.textures.length;index++){
   const texture=variant.textures[index];progress('Generating texture '+(++textureCount)+'…');
   if(!texture.path.startsWith(prefix+'assets/')||!safePath(texture.path)||!texture.path.endsWith('.tex'))throw Error('Invalid package texture.');
   const original=new Uint8Array(texture.byteLength);let cursor=0;
   for(const part of texture.parts){const value=bytes(await fetchBytes(part));if(cursor+value.length>original.length)throw Error('Unexpected texture data.');original.set(value,cursor);cursor+=value.length}
   if(cursor!==original.length||await sha256(original)!==texture.originalRgbaSha256)throw Error('Could not verify the original texture.');
   const rawMask=bytes(await fetchBytes(texture.mask)),mask=await decodeMaskPng(rawMask);validateMask(mask,texture.width,texture.height,texture.maskEncoding,variant.anchors.length);
   const result=encodeTexture(await materialTexture(texture),original,mask.pixels,values.targets,{anchors:variant.anchors,roles:variant.roles,paint:values.paint?.[texture.id],colourMode:values.colourMode,finish:values.finish,partFinishes:values.partFinishes});
   addResource(texture.path,result);await zip.add('META/masks/'+scope+texture.id+'.png',rawMask);
  }
  for(const ability of variant.abilityVfx?.abilities??[])if(values.abilityVfx?.[ability.id]?.enabled)for(const texture of ability.textures??[]){
   if(!['assets/atelier/abilities/','assets/av/'].some(folder=>texture.path.startsWith(prefix+folder))||!safePath(texture.path)||!texture.path.endsWith('.tex'))throw Error('Invalid ability texture.');
   progress('Preparing '+ability.id.toUpperCase()+' effect texture…');const original=await originalTexture(texture),level=texture.levels.find(level=>level.level===0),pixels=original.subarray(level.offset,level.offset+level.length),changed=abilityTexturePixels(pixels,values.abilityVfx?.[ability.id]);addResource(texture.path,encodeChangedTexture(texture,original,changed));textureCount++;
  }
  if(values.finish)for(const texture of variant.fullMaterials.textures){
   if(texture.finish.kind==='fx'&&values.finish.effects===false)continue;if(!texture.path.startsWith(prefix+'assets/')||!safePath(texture.path))throw Error('Invalid effect texture.');progress('Preparing full material '+(++textureCount)+'…');const original=await originalTexture(texture),level=texture.levels.find(level=>level.level===0),pixels=original.subarray(level.offset,level.offset+level.length),changed=fullMaterialPixels(pixels,texture.finish,values.finish);addResource(texture.path,encodeChangedTexture(texture,original,changed));
  }
 }
 await packVariant(descriptor,palette);
 const forms=descriptor.relatedForms??[];for(const id of Object.keys(palette.forms??{}))if(!forms.some(form=>form.id===id))throw Error('Unknown character form.');
 for(const form of forms){if(!/^\w+$/.test(form.id)||!safePath(form.asset))throw Error('Invalid form definition.');const variant=JSON.parse(new TextDecoder().decode(bytes(await fetchBytes(form.asset)))),values=palette.forms?.[form.id]??{anchors:variant.anchors,targets:variant.anchors,energy:palette.energy,effects:false};await packVariant(variant,values,form.id+'/')}
 progress('Packing .fantome…');
 for(const [prefix,resources] of archives)await zip.add(prefix.slice(0,-1),await packWad(resources),{store:true});
 const sourceName=SKIN_NAMES[descriptor.id]??descriptor.name;
 const customName=customExportName(palette.exportName),name=customName||defaultExportName(sourceName,palette.name),description='Chroma for the original '+sourceName+' skin. You must own this skin and select it in League of Legends. Paid skins are never redirected to Classic; exports do not grant access to unowned skins. Enable one chroma for this skin at a time. Preserves source models, animations and sounds.';
 const abilityCoverageVersion=descriptor.abilityVfx?.coverageVersion,version=abilityCoverageVersion>=2?'2.1.0':'2.0.0';
 await zip.add('META/info.json',json({Name:name,Author:'Atelier',Version:version,Champion:descriptor.champion,Description:description}));await zip.add('metadata.json',json({name,author:'Atelier',version,description}));
 await zip.add('META/LEGAL.txt',utf8.encode(EXPORT_LEGAL_NOTICE));await zip.add('META/palette.json',json(palette));await zip.add('META/validation.json',json({target:'original',sourceSkin:descriptor.id,skin:descriptor.skin,revision:descriptor.revision,abilityCoverageVersion,encoding:'bgra8_lossless',alphaExactAllMips:true,sourceIdentityVerified:true,requiresOriginalSkin:true,format:'fantome_packed_wad_v3.4',gameTested:false}));
 if(thumbnail){const image=thumbnail instanceof Blob?new Uint8Array(await thumbnail.arrayBuffer()):bytes(thumbnail);if(image.length<8||![137,80,78,71,13,10,26,10].every((value,index)=>image[index]===value))throw Error('Could not prepare the package thumbnail.');await zip.add('META/image.png',image)}
 const signature=(await sha256(json(abilityCoverageVersion>=2?{palette,source:descriptor.source.sha256,abilityCoverageVersion}:palette))).slice(0,8),filename=exportFilename(customName,'recolor-'+descriptor.id+'-'+signature+'.fantome');return{blob:zip.finish(),filename,name,textures:textureCount};
}
