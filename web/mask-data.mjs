import {resources} from './resource-cache.mjs';
const signature=[137,80,78,71,13,10,26,10];
function paeth(a,b,c){const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c}

export async function decodeMaskPng(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<33||!signature.every((value,i)=>bytes[i]===value))throw Error('The mask is not a valid PNG.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts=[];
 let width=0,height=0,channels=0,ended=false,offset=8;
 while(offset+12<=bytes.length){
  const length=view.getUint32(offset),type=String.fromCharCode(...bytes.subarray(offset+4,offset+8)),start=offset+8,end=start+length;
  if(end+4>bytes.length)throw Error('The PNG mask is incomplete.');
  if(type==='IHDR'){
   if(offset!==8||length!==13)throw Error('Invalid mask header.');
   width=view.getUint32(start);height=view.getUint32(start+4);channels=({0:1,2:3,4:2,6:4})[bytes[start+9]];
   if(!width||!height||width*height>16777216||bytes[start+8]!==8||!channels||bytes[start+10]||bytes[start+11]||bytes[start+12])throw Error('Unsupported mask format.');
  }else if(type==='IDAT')parts.push(bytes.subarray(start,end));
  else if(type==='IEND'){ended=true;break}
  offset=end+4;
 }
 if(!ended||!channels||!parts.length)throw Error('The PNG mask is incomplete.');
 const stream=new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate'));
 const packed=new Uint8Array(await new Response(stream).arrayBuffer()),stride=width*channels;
 if(packed.length!==(stride+1)*height)throw Error('Mask dimensions do not match its data.');
 const raw=new Uint8Array(stride*height);
 for(let y=0;y<height;y++){
  const row=y*stride,source=y*(stride+1),filter=packed[source];
  if(filter>4)throw Error('Invalid PNG mask filter.');
  for(let x=0;x<stride;x++){
   const left=x>=channels?raw[row+x-channels]:0,up=y?raw[row+x-stride]:0,corner=y&&x>=channels?raw[row+x-stride-channels]:0;
   raw[row+x]=(packed[source+x+1]+(filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner)))&255;
  }
 }
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let p=0,q=0;p<raw.length;p+=channels,q+=4){
  pixels[q]=raw[p];pixels[q+1]=channels<3?raw[p]:raw[p+1];pixels[q+2]=channels<3?raw[p]:raw[p+2];pixels[q+3]=channels===2?raw[p+1]:channels===4?raw[p+3]:255;
 }
 return{width,height,pixels};
}

export function validateMask(mask,width,height,encoding,zoneCount){
 if(mask.width!==width||mask.height!==height)throw Error('Mask dimensions do not match the texture.');
 for(let p=0;p<mask.pixels.length;p+=4){const value=mask.pixels[p]+(encoding==='rgb24'?(mask.pixels[p+1]<<8)+(mask.pixels[p+2]<<16):0);if(value>zoneCount)throw Error('The mask contains an undefined part.');}
 return mask.pixels;
}

export async function loadMaskData(url){
 return resources.load('png:'+new URL(url,globalThis.location?.href??import.meta.url).href,async()=>{
 const response=await fetch(url);
 if(!response.ok)throw Error('Could not download the mask.');
 return decodeMaskPng(await response.arrayBuffer());
 },{size:image=>image.pixels.byteLength});
}
