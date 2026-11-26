import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {decodeMaskPng,validateMask} from '../web/mask-data.mjs';

function chunk(type,data){
 const name=Buffer.from(type),content=Buffer.concat([name,data]);let crc=0xffffffff;
 for(const value of content){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
 const size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,content,checksum]);
}
function sample(){
 const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(5,4);header[8]=8;header[9]=2;
 const row=[2,1,0,53,0,0],rows=[];
 for(let filter=0;filter<5;filter++){
  const data=[filter];for(let x=0;x<row.length;x++){
   const left=x>=3?row[x-3]:0,up=filter?row[x]:0,corner=filter&&x>=3?row[x-3]:0,p=left+up-corner,da=Math.abs(p-left),db=Math.abs(p-up),dc=Math.abs(p-corner);
   const predictor=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):da<=db&&da<=dc?left:db<=dc?up:corner;data.push((row[x]-predictor)&255);
  }rows.push(Buffer.from(data));
 }
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
}
test('mask IDs survive all PNG filters without canvas or color conversion',async()=>{
 const result=await decodeMaskPng(sample());assert.equal(result.width,2);assert.equal(result.height,5);
 assert.deepEqual([...result.pixels],Array.from({length:5},()=>[2,1,0,255,53,0,0,255]).flat());
 assert.equal(validateMask(result,2,5,'rgb24',258),result.pixels);
 assert.throws(()=>validateMask(result,2,5,'rgb24',257),/undefined part/);
 assert.throws(()=>validateMask(result,4,5,'rgb24',258),/dimensions/);
});
test('damaged mask data fails instead of silently assigning colors',async()=>{
 await assert.rejects(decodeMaskPng(new Uint8Array([1,2,3])),/valid PNG/);
 await assert.rejects(decodeMaskPng(sample().subarray(0,40)),/incomplete/);
});

test('RGBA decoding preserves colour data even when alpha is zero',async()=>{
 const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,120,80,40,0,20,40,60,255]))),chunk('IEND',Buffer.alloc(0))]);
 const decoded=await decodeMaskPng(png);assert.deepEqual([...decoded.pixels],[120,80,40,0,20,40,60,255]);
});
