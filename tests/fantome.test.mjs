import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {FantomeZip,encodeTexture,recolorEffects,resizeDelta} from '../web/fantome-engine.mjs';

test('fantome ZIP stores valid UTF-8 entries with real deflate data',async()=>{
 const zip=new FantomeZip(),content=new TextEncoder().encode('{"Name":"Prueba Clásico"}');await zip.add('META/info.json',new Blob([content]));
 const data=new Uint8Array(await zip.finish().arrayBuffer()),view=new DataView(data.buffer),length=view.getUint16(26,true),size=view.getUint32(18,true);
 assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);assert.deepEqual(new Uint8Array(inflateRawSync(data.subarray(30+length,30+length+size))),content);assert.equal(view.getUint32(data.length-22,true),0x06054b50);assert.equal(view.getUint16(data.length-14,true),1);
 await assert.rejects(zip.add('../escape.bin',content),/path/);
});
test('texture recoloring preserves alpha and unassigned pixels in every mip',()=>{
 const original=new Uint8Array([90,80,70,37,100,100,100,19,20,30,40,29,50,60,70,39,80,90,100,49]),texture={width:2,height:2,byteLength:20,header:[84,69,88,0,2,0,2,0,1,20,0,1],maskEncoding:'rgb24',profiles:[{reference:100/255,high:1}],levels:[{level:1,width:1,height:1,offset:0,length:4},{level:0,width:2,height:2,offset:4,length:16}]};
 const mask=new Uint8Array([1,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255]),out=encodeTexture(texture,original,mask,['#ff0000'],{anchors:['#646464'],roles:[{kind:'cloth'}]});
 for(let p=0;p<5;p++)assert.equal(out[12+p*4+3],original[p*4+3]);
 assert.deepEqual([...out.subarray(16,20)],[0,0,255,19]);
 for(let p=2;p<5;p++)assert.deepEqual([...out.subarray(12+p*4,16+p*4)],[original[p*4+2],original[p*4+1],original[p*4],original[p*4+3]]);
});
test('effect recoloring changes only the recorded RGB bytes',()=>{
 const raw=new Uint8Array(28).fill(99),view=new DataView(raw.buffer);view.setFloat32(8,.8,true);view.setFloat32(12,.5,true);view.setFloat32(16,.2,true);view.setFloat32(20,.7,true);
 const slots=[{offset:1,format:'u8',maximum:220},{offset:8,format:'f32',maximum:.8}],out=recolorEffects(raw,slots,'#44ccff');
 for(const offset of [0,4,5,6,7,20,21,22,23,24,25,26,27])assert.equal(out[offset],raw[offset]);assert.deepEqual([...out.subarray(1,4)],[59,176,220]);assert.notEqual(new DataView(out.buffer).getFloat32(8,true),view.getFloat32(8,true));
});
test('BOX mip adjustments match floating-point reference samples',()=>{
 const input=Float32Array.from({length:5*7*3},(_,i)=>(i*29)%511-255),out=resizeDelta(input,5,7,2,3);
 assert.equal(out.length,18);assert.deepEqual([...out.subarray(0,3)],[-120.83332824707031,-91.83333587646484,-62.83333206176758]);
 const odd=Float32Array.from({length:13*9*3},(_,i)=>(i*29)%511-255);assert.deepEqual([...resizeDelta(odd,13,9,6,4).subarray(6,9)],[63.25,92.25,-6.5]);
});
