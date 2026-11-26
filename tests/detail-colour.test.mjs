import test from 'node:test';
import assert from 'node:assert/strict';
import {materialCache,materialPixels} from '../web/material-engine.mjs';
import {hsv,hexRgb,fullMaterialPixels,finishVector,validateFinish,FINISH_PRESETS,preserveDetail} from '../web/detail-colour.mjs';
import {recolorFinishParameters} from '../web/fantome-engine.mjs';
import {paletteSnapshot} from '../web/edit-history.mjs';
import {applyNativeVisibility} from '../web/native-visibility.mjs';

test('detail preserving colour keeps original hue variations, neutral highlights and exact alpha',()=>{
 const original=new Uint8ClampedArray([210,35,35,31,210,65,35,71,255,255,255,91,0,0,0,101]),mask=new Uint8Array([1,0,0,255,1,0,0,255,1,0,0,255,1,0,0,255]),zones={anchors:['#d22323'],roles:[{kind:'appearance'}],profiles:[{reference:.5,high:1}]},cache=materialCache(original,mask,zones),result=materialPixels(original,['#2355d2'],cache,{colourMode:'preserve'});
 assert.deepEqual(materialPixels(original,zones.anchors,cache,{colourMode:'preserve'}),original);for(let i=3;i<original.length;i+=4)assert.equal(result[i],original[i]);assert.deepEqual([...result.subarray(8,11)],[255,255,255]);assert.deepEqual([...result.subarray(12,15)],[0,0,0]);assert.notDeepEqual([...result.subarray(0,3)],[...result.subarray(4,7)]);
 const first=hsv([...result.subarray(0,3)].map(v=>v/255)),second=hsv([...result.subarray(4,7)].map(v=>v/255));assert.ok(Math.abs(first[0]-second[0])>.015);
});
test('full material finish preserves original alpha, splits normal and R hues and excludes effect masks',()=>{
 const original=new Uint8ClampedArray([240,0,0,19,0,240,240,29]),finish={profile:'yi',...FINISH_PRESETS.cobalt},result=fullMaterialPixels(original,{kind:'model',state:'normal',weaponSplit:true},finish);assert.equal(result[3],19);assert.equal(result[7],29);assert.ok(result[2]>result[1]);assert.ok(result[5]>result[1]);assert.ok(result[6]>=result[5]);assert.deepEqual(fullMaterialPixels(original,{kind:'fx',state:'r'},{...finish,effects:false}),original);assert.deepEqual(fullMaterialPixels(original,null,finish),original);
});
test('dynamic material constants and VFX retain alpha, intensity and separate R colours',()=>{
 const raw=new Uint8Array(36).fill(21),view=new DataView(raw.buffer);[1,.6,.6,.8].forEach((v,i)=>view.setFloat32(i*4,v,true));[1,.6,.6,.3].forEach((v,i)=>view.setFloat32(16+i*4,v,true));
 const rgba=offset=>[0,1,2,3].map(i=>view.getFloat32(offset+i*4,true)),profile={id:'yi',slots:[{offset:0,format:'f32',rgba:rgba(0),state:'normal',role:'dynamic'},{offset:16,format:'f32',rgba:rgba(16),state:'r',role:'vfx'}]},finish={profile:'yi',...FINISH_PRESETS.cobalt},changed=recolorFinishParameters(raw,profile,finish),result=new DataView(changed.buffer);
 assert.equal(result.getFloat32(12,true),view.getFloat32(12,true));assert.equal(result.getFloat32(28,true),view.getFloat32(28,true));assert.ok(result.getFloat32(20,true)>result.getFloat32(4,true));assert.deepEqual(changed.subarray(32),raw.subarray(32));
 assert.deepEqual(recolorFinishParameters(raw,profile,{...finish,effects:false}).subarray(16),raw.subarray(16));assert.deepEqual(finishVector([0,0,0],'r',finish),[0,0,0]);assert.deepEqual(finishVector([1,1,1],'r',finish),[1,1,1]);assert.throws(()=>validateFinish({...finish,profile:'other'},profile),/does not belong/);assert.throws(()=>validateFinish({...finish,metalGain:99},profile),/Invalid/);
});
test('individual parts can override or revert a full finish without losing its reference palette',()=>{
 const original=new Uint8ClampedArray([220,0,0,255,220,0,0,255]),mask=new Uint8Array([1,0,0,255,2,0,0,255]),zones={anchors:['#dc0000','#dc0000'],roles:[{kind:'appearance'},{kind:'appearance'}],profiles:[{reference:.4,high:1},{reference:.4,high:1}]},cache=materialCache(original,mask,zones),finish={profile:'yi',...FINISH_PRESETS.cobalt,exemptZones:[0]},result=materialPixels(original,zones.anchors,cache,{finish,texture:{kind:'model',state:'normal'},colourMode:'preserve'});
 assert.deepEqual(result.subarray(0,4),original.subarray(0,4));assert.notDeepEqual(result.subarray(4),original.subarray(4));const owner={targets:zones.anchors,finish,colourMode:'preserve'},snapshot=paletteSnapshot(owner);owner.finish.exemptZones.push(1);assert.deepEqual(snapshot.finish.exemptZones,[0]);
});
test('preview state selects the native transformation independently of the chosen animation',()=>{
 const mesh={material:[{visible:true},{visible:false}],userData:{nativeGroups:[{name:'Body'},{name:'UltBody'}],finishState:'r'}},skin={previewStates:[{id:'normal',visible:['Body']},{id:'r',visible:['UltBody']}]};applyNativeVisibility(mesh,skin,'run');assert.deepEqual(mesh.material.map(m=>m.visible),[false,true]);mesh.userData.finishState='normal';applyNativeVisibility(mesh,skin,'attack');assert.deepEqual(mesh.material.map(m=>m.visible),[true,false]);
});

test('brighter targets retain a monotonic highlight range instead of clipping several shades to one value',()=>{
 const original=new Uint8ClampedArray([80,20,20,255,130,32,32,255,180,45,45,255,230,58,58,255]),mask=new Uint8Array([1,0,0,255,1,0,0,255,1,0,0,255,1,0,0,255]),zones={anchors:['#822020'],roles:[{kind:'appearance'}],profiles:[{reference:.3,high:1}]},out=materialPixels(original,['#2266ff'],materialCache(original,mask,zones),{colourMode:'preserve'}),values=[0,4,8,12].map(offset=>Math.max(...out.subarray(offset,offset+3)));assert.ok(values.every((v,i)=>i===0||v>values[i-1]));assert.ok(values.at(-1)<255);
});

test('grey metal anchors cannot rotate source noise into unrelated green or purple hues',()=>{
 const target=hexRgb('#6687b7'),anchor=hexRgb('#888188'),desired=hsv(target)[0];
 for(const pixel of ['#858881','#817c88','#706d67','#a9a5ab']){const result=preserveDetail(hexRgb(pixel),anchor,target);assert.ok(Math.abs(hsv(result)[0]-desired)<.001)}
 const blue=hexRgb('#4d7cff'),result=preserveDetail(hexRgb('#22ddaa'),hexRgb('#de2727'),blue);assert.ok(Math.abs(hsv(result)[0]-hsv(blue)[0])<=.081);
});
