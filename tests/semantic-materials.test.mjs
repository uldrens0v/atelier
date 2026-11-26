import test from 'node:test';
import assert from 'node:assert/strict';
import {fullMaterialPixels,semanticLabels,validateFinish} from '../web/detail-colour.mjs';
import {materialCache,materialPixels} from '../web/material-engine.mjs';
import {encodeTexture} from '../web/fantome-engine.mjs';

function fixture(){const original=new Uint8ClampedArray([180,140,70,29,190,135,100,79,45,70,100,129]),semantic={mask:'semantic.png',channelIds:['metal','skin'],anchors:['#b48c46','#be8764'],roles:[{kind:'metal'},{kind:'skin'}],profiles:[{low:0,mid:.4,reference:.5,high:1},{low:0,mid:.5,reference:.5,high:1}],labels:new Uint32Array([0,1,0xffffffff])},texture={kind:'model',state:'normal',semantic},finish={profile:'test',channels:{metal:'#55bbaa',skin:'#be8764'},saturation:.8,metalGain:1.1};return{original,semantic,texture,finish}}
test('reviewed material maps separate metal from skin and unassigned pixels while keeping alpha',()=>{
 const {original,texture,finish}=fixture(),out=fullMaterialPixels(original,texture,finish,'preserve');assert.notDeepEqual(out.subarray(0,3),original.subarray(0,3));assert.deepEqual(out.subarray(4),original.subarray(4));for(let i=3;i<out.length;i+=4)assert.equal(out[i],original[i]);
});
test('identity palettes and returned cached arrays cannot mutate source pixels or later renders',()=>{
 const {original,texture,finish}=fixture(),identity={profile:'test',channels:{metal:'#b48c46',skin:'#be8764'},saturation:1,metalGain:1};assert.deepEqual(fullMaterialPixels(original,texture,identity),original);const out=fullMaterialPixels(original,texture,finish);const first=out[0];out[0]=0;assert.equal(fullMaterialPixels(original,texture,finish)[0],first);assert.equal(original[0],180);
});
test('export rejects unknown semantic channels or attempts to change protected skin globally',()=>{
 const profile={id:'test',channels:[{id:'metal',anchor:'#b48c46',editable:true},{id:'skin',anchor:'#be8764',editable:false}]};assert.doesNotThrow(()=>validateFinish({profile:'test',channels:{metal:'#112233',skin:'#be8764'}},profile));assert.throws(()=>validateFinish({profile:'test',channels:{other:'#112233'}},profile),/Unknown/);assert.throws(()=>validateFinish({profile:'test',channels:{skin:'#ffffff'}},profile),/skin tones/);
});
test('semantic PNGs preserve exact byte IDs and reject unknown labels',()=>{
 assert.deepEqual([...semanticLabels(new Uint8Array([1,0,0,255,0,0,0,255,2,0,0,255]),'r8',2)],[0,0xffffffff,1]);assert.throws(()=>semanticLabels(new Uint8Array([3,0,0,255]),'r8',2),/Unknown material/);
});
test('source-colour isolation and local grading layer correctly over a curated global material palette',()=>{
 const {original,texture,finish}=fixture(),mask=new Uint8Array([1,0,0,255,1,0,0,255,0,0,0,255]),zones={anchors:['#b48c46'],roles:[{kind:'appearance'}],profiles:[{low:0,reference:.4,high:1}]},cache=materialCache(original,mask,zones),base=materialPixels(original,zones.anchors,cache,{finish,texture,colourMode:'preserve'}),graded=materialPixels(original,zones.anchors,cache,{finish,texture,colourMode:'preserve',partFinishes:{0:{exposure:-1}}});assert.notDeepEqual(graded.subarray(0,3),base.subarray(0,3));assert.deepEqual(graded.subarray(8),original.subarray(8));
 const tex={width:3,height:1,byteLength:12,header:[84,69,88,0,3,0,1,0,1,20,0,0],profiles:zones.profiles,levels:[{level:0,width:3,height:1,offset:0,length:12}],finish:texture},encoded=encodeTexture(tex,original,mask,zones.anchors,{...zones,finish,colourMode:'preserve',partFinishes:{0:{exposure:-1}}});for(let p=0;p<3;p++)assert.deepEqual([...encoded.subarray(12+p*4,16+p*4)],[graded[p*4+2],graded[p*4+1],graded[p*4],original[p*4+3]]);
});
