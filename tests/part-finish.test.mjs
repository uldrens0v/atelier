import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePartFinish,colourRangeWeight,finishPartColour,partMaskPreview,validatePartFinishes} from '../web/part-finish.mjs';
import {materialCache,materialPixels} from '../web/material-engine.mjs';
import {encodeTexture,recolorMaterialParameters} from '../web/fantome-engine.mjs';
import {paletteSnapshot} from '../web/edit-history.mjs';
import {hexRgb} from '../web/detail-colour.mjs';

function fixture(){const original=new Uint8ClampedArray([180,30,30,31,40,40,40,71,230,230,230,99,30,150,200,121]),mask=new Uint8Array([1,0,0,255,1,0,0,255,1,0,0,255,0,0,0,255]),zones={anchors:['#b41e1e'],roles:[{kind:'appearance'}],profiles:[{low:0,mid:.3,reference:.4,high:1}]};return{original,mask,zones,cache:materialCache(original,mask,zones)}}
test('accent isolation changes only original coloured surfaces and keeps neutral metal and alpha intact',()=>{
 const {original,cache}=fixture(),out=materialPixels(original,['#2277dd'],cache,{colourMode:'preserve',partFinishes:{0:{range:{mode:'chroma'}}}});assert.notDeepEqual(out.subarray(0,3),original.subarray(0,3));assert.deepEqual(out.subarray(4),original.subarray(4));for(let i=3;i<out.length;i+=4)assert.equal(out[i],original[i]);
});
test('per-part grading works without repainting, leaves unassigned texels unchanged and is identity by default',()=>{
 const {original,cache,zones}=fixture();assert.deepEqual(materialPixels(original,zones.anchors,cache,{partFinishes:{0:{}}}),original);const out=materialPixels(original,zones.anchors,cache,{partFinishes:{0:{exposure:1,contrast:1.3}}});assert.notDeepEqual(out.subarray(0,11),original.subarray(0,11));assert.deepEqual(out.subarray(12),original.subarray(12));for(let i=3;i<out.length;i+=4)assert.equal(out[i],original[i]);
});
test('source hue range crosses red wraparound and neutral sampling does not select coloured glows',()=>{
 const red=preparePartFinish({range:{mode:'sample',color:'#ff0022',tolerance:24}});assert.ok(colourRangeWeight(hexRgb('#ff1100'),red)>.9);assert.equal(colourRangeWeight(hexRgb('#00ff55'),red),0);const grey=preparePartFinish({range:{mode:'sample',color:'#888888',tolerance:24}});assert.equal(colourRangeWeight(hexRgb('#888888'),grey),1);assert.equal(colourRangeWeight(hexRgb('#0088ff'),grey),0);assert.equal(colourRangeWeight(hexRgb('#eeeeee'),grey),0);
});
test('shadow and highlight tints affect their own tone ranges while retaining exact texture alpha',()=>{
 const {original,cache,zones}=fixture(),out=materialPixels(original,zones.anchors,cache,{partFinishes:{0:{shadowColor:'#223388',shadowAmount:.6,highlightColor:'#ffcc77',highlightAmount:.7}}});assert.ok(out[6]>out[4]);assert.ok(out[8]>out[10]);for(let i=3;i<out.length;i+=4)assert.equal(out[i],original[i]);
});
test('range preview reads original colours, limits the selected parts and never changes alpha',()=>{
 const {original,cache}=fixture(),preview=partMaskPreview(original,cache.labels,[0],{0:{range:{mode:'chroma'}}});assert.equal(preview[0],255);assert.equal(preview[4],Math.round(original[4]*.12));assert.equal(preview[12],Math.round(original[12]*.12));for(let i=3;i<preview.length;i+=4)assert.equal(preview[i],original[i]);
});
test('export uses the same finish pixels as the viewport and preserves all mip alpha samples',()=>{
 const {original,mask,zones,cache}=fixture(),texture={width:2,height:2,byteLength:16,header:[84,69,88,0,2,0,2,0,1,20,0,0],profiles:zones.profiles,levels:[{level:0,width:2,height:2,offset:0,length:16}]},options={colourMode:'preserve',partFinishes:{0:{exposure:.6,saturation:.8,shadowAmount:.2}}},view=materialPixels(original,['#aa5522'],cache,options),encoded=encodeTexture(texture,original,mask,['#aa5522'],{...zones,...options});for(let p=0;p<4;p++)assert.deepEqual([...encoded.subarray(12+p*4,16+p*4)],[view[p*4+2],view[p*4+1],view[p*4],original[p*4+3]]);
});
test('native shader grading preserves HDR scale, alpha and RGB-only offsets',()=>{
 const raw=new Uint8Array(28).fill(91),view=new DataView(raw.buffer);[2,1,.5,.7].forEach((value,index)=>view.setFloat32(4+index*4,value,true));const rgba=[0,1,2,3].map(i=>view.getFloat32(4+i*4,true)),out=recolorMaterialParameters(raw,[{zone:0,offset:4,rgba,maximum:2}],['#ff8040'],['#ff8040'],{partFinishes:{0:{exposure:-1}}});assert.notDeepEqual(out.subarray(4,16),raw.subarray(4,16));assert.deepEqual(out.subarray(16),raw.subarray(16));assert.deepEqual(out.subarray(0,4),raw.subarray(0,4));
});
test('finish metadata rejects invalid parts and parameters and snapshots keep independent copies',()=>{
 assert.throws(()=>validatePartFinishes({3:{exposure:1}},2));assert.throws(()=>validatePartFinishes({0:{exposure:12}},1));assert.throws(()=>validatePartFinishes({0:{alpha:0}},1));assert.throws(()=>validatePartFinishes({0:{range:{mode:'sample',color:'bad'}}},1));const state={targets:['#fff'],partFinishes:{0:{range:{mode:'sample',color:'#ff0000',tolerance:22}}}},snapshot=paletteSnapshot(state);state.partFinishes[0].range.color='#0000ff';assert.equal(snapshot.partFinishes[0].range.color,'#ff0000');
});
