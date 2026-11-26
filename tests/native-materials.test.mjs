import test from 'node:test';
import assert from 'node:assert/strict';
import {recolorMaterialParameters} from '../web/fantome-engine.mjs';
import {availability} from '../web/zone-availability.mjs';
import {applyNativeVisibility} from '../web/native-visibility.mjs';

test('material colours preserve native HDR values at identity and change only RGB when edited',()=>{
 const input=new Uint8Array(52).fill(19),view=new DataView(input.buffer),rgba=[1.5,0,.3,.42];rgba.forEach((value,index)=>view.setFloat32(7+index*4,value,true));
 const slots=[{zone:0,offset:7,rgba,maximum:1.5}],anchors=['#ff0033'];assert.deepEqual(recolorMaterialParameters(input,slots,anchors,anchors),input);
 const changed=recolorMaterialParameters(input,slots,['#146eff'],anchors),out=new DataView(changed.buffer);assert.equal(out.getFloat32(7,true),Math.fround(20/255*1.5));assert.equal(out.getFloat32(11,true),Math.fround(110/255*1.5));assert.equal(out.getFloat32(15,true),1.5);assert.deepEqual(changed.subarray(19,23),input.subarray(19,23));
 for(let index=0;index<input.length;index++)if(index<7||index>=19)assert.equal(changed[index],input[index]);
 assert.throws(()=>recolorMaterialParameters(input,[{...slots[0],offset:49}],['#146eff'],anchors),/Invalid/);assert.throws(()=>recolorMaterialParameters(input,[{...slots[0],rgba:[2,0,0,1]}],['#146eff'],anchors),/does not match/);
});

test('native colour controls remain editable without treating data masks as painted texture regions',()=>{
 const skin={zones:{anchors:['#aaaaaa','#ff0000','#00ff00']},hiddenSubmeshes:['tail_large'],materialControls:[{zone:1,groups:['Tail','Tail_Large']},{zone:2,groups:['Tail_Large']}]},records=[{cache:{labels:new Uint32Array([0,0])},original:new Uint8Array([1,1,1,255,1,1,1,255])}],report=availability(records,skin);assert.equal(report[1].state,'active');assert.equal(report[2].state,'other_view');
});

test('native mesh events hide inactive props and never reveal an unprepared surface',()=>{
 const mesh={material:[{visible:true},{visible:false},{visible:false}],userData:{nativeGroups:[{name:'Body',start:0,count:3},{name:'Armour',start:3,count:3},{name:'RecallProp',start:6,count:3}],nativeTriangleRoles:[1,2,0]}},skin={hiddenSubmeshes:['armour','recallprop'],nativeVisibility:{idle:{hidden:[],shown:[]},recall:{hidden:['Body'],shown:['Armour','RecallProp']}}};
 applyNativeVisibility(mesh,skin,'recall');assert.deepEqual(mesh.material.map(item=>item.visible),[false,true,false]);assert.equal(mesh.userData.nativeVisibilityDirty,true);applyNativeVisibility(mesh,skin,'idle');assert.deepEqual(mesh.material.map(item=>item.visible),[true,false,false]);
});
