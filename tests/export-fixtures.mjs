import {inflateRawSync,gunzipSync} from 'node:zlib';
import {xxhash64} from '../web/xxhash64-vendor.mjs';

export function nativeDefinition(champion,skin){
 const data=new Uint8Array(30),view=new DataView(data.buffer);data.set([80,82,79,80]);view.setUint32(4,3,true);view.setUint32(12,1,true);view.setUint32(20,6,true);let hash=0x811c9dc5;for(const code of new TextEncoder().encode(('characters/'+champion+'/skins/skin'+skin).toLowerCase()))hash=Math.imul(hash^code,0x1000193)>>>0;view.setUint32(24,hash,true);return data;
}
export async function fixture(champion='Test',skin=7){
 const raw=nativeDefinition(champion,skin),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const descriptor={version:2,target:'original',skin,id:champion.toLowerCase()+'-'+skin,champion,name:'Fixture',revision:'mesh-test',anchors:['#808080'],roles:[{kind:'cloth'}],sourceValidation:{skin,sourceIdentityVerified:true},source:{asset:'data.bin',path:'WAD/'+champion+'.wad.client/data/characters/'+champion.toLowerCase()+'/skins/skin'+skin+'.bin',sha256:sha,effectSlots:[]},textures:[],relatedForms:[]};
 const palette={method:'material-zones-v1',target:'original',skin:descriptor.id,experimentVariant:'mesh-test',anchors:['#808080'],targets:['#2255aa'],energy:'#2255aa',effects:false};return{raw,descriptor,palette};
}
export function unzip(input){
 const data=new Uint8Array(input),view=new DataView(data.buffer,data.byteOffset,data.byteLength),entries=new Map();let offset=0;
 while(view.getUint32(offset,true)===0x04034b50){const length=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),size=view.getUint32(offset+18,true),name=new TextDecoder().decode(data.subarray(offset+30,offset+30+length)),start=offset+30+length+extra,body=data.subarray(start,start+size);entries.set(name,view.getUint16(offset+8,true)===0?body:new Uint8Array(inflateRawSync(body)));offset=start+size}
 return entries;
}
export function unpackWad(input){
 const data=new Uint8Array(input),view=new DataView(data.buffer,data.byteOffset,data.byteLength),entries=new Map();if(data[0]!==82||data[1]!==87||data[2]!==3||data[3]!==4)throw Error('Invalid WAD');
 for(let i=0;i<view.getUint32(268,true);i++){const at=272+i*32,start=view.getUint32(at+8,true),size=view.getUint32(at+12,true),raw=gunzipSync(data.subarray(start,start+size));if(raw.length!==view.getUint32(at+16,true))throw Error('Invalid chunk length');entries.set(view.getBigUint64(at,true),new Uint8Array(raw))}return entries;
}
export async function wadResource(entries,path){return entries.get(BigInt('0x'+await xxhash64(path.toLowerCase())))}
