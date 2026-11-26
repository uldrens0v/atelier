import test from 'node:test';
import assert from 'node:assert/strict';
import {EditHistory} from '../web/edit-history.mjs';
import {coordinatedPalette,paletteScheme} from '../web/coordinated-palette.mjs';
import {PaintLayer,composePaint,paintTriangle} from '../web/paint-engine.mjs';
import {encodeTexture,createFantome} from '../web/fantome-engine.mjs';
import {inflateRawSync} from 'node:zlib';
import {exportDesign,stateKey} from '../web/design-state.mjs';

test('colour gestures undo together and a new edit discards the redo branch',()=>{
 const history=new EditHistory(),owner={value:0};
 function edit(value,key){const before=owner.value;owner.value=value;history.push({key,undo:()=>owner.value=before,redo:()=>owner.value=value})}
 edit(1,'picker');edit(2,'picker');assert.equal(history.past.length,1);history.undo();assert.equal(owner.value,0);history.redo();assert.equal(owner.value,2);history.undo();edit(3);assert.equal(history.canRedo,false);history.undo();assert.equal(owner.value,0);
});

test('coordinated palettes keep identical materials together and protect explicit skin roles',()=>{
 const zones={anchors:['#664422','#664422','#aaaaaa','#eebbaa'],roles:[{kind:'appearance'},{kind:'appearance'},{kind:'metal'},{kind:'skin'}]},palette=coordinatedPalette(zones,['#2255aa','#c0c0c0','#ffaa22'],[500,200,300,100]);assert.equal(palette[0],palette[1]);assert.equal(palette[3],'#eebbaa');assert.ok(palette.every(color=>/^#[0-9a-f]{6}$/i.test(color)));const scheme=paletteScheme('#2255aa','complementary');assert.equal(scheme[0],'#2255aa');assert.notEqual(scheme[1],scheme[0]);
});

test('surface brush stays inside UV triangles, erases, and exports an identical sparse layer',()=>{
 const original=Uint8ClampedArray.from({length:8*8*4},(_,i)=>i%4===3?37:128),layer=new PaintLayer(8,8),before=new Map(),stamp={uv:[0,0,1,0,0,1],space:[-.5,-.5,0,.5,-.5,0,-.5,.5,0],color:'#ff0000',opacity:.75,hardness:1,reference:128/255};
 assert.ok(paintTriangle(layer,original,stamp,before)>0);assert.equal(layer.values.has(63),false);const preview=composePaint(original,layer,8,8),encoded=composePaint(original,layer.payload(),8,8);assert.deepEqual(preview,encoded);for(let i=3;i<preview.length;i+=4)assert.equal(preview[i],37);assert.ok(preview[0]>128);assert.ok(preview[1]<128);
 const saved=new Map(layer.values);paintTriangle(layer,original,{...stamp,erase:true,opacity:1},new Map());assert.equal(layer.values.size,0);layer.applyChange(Uint32Array.from(saved.keys()),Uint32Array.from(saved.values()));assert.deepEqual(composePaint(original,layer,8,8),preview);
});

test('painting matches texture export and preserves alpha in every mip',()=>{
 const original=Uint8Array.from([128,128,128,73,...Array.from({length:4},()=>[128,128,128,37]).flat()]),layer=new PaintLayer(2,2);layer.set(0,(128<<24)|255);
 const texture={width:2,height:2,byteLength:20,header:[84,69,88,0,2,0,2,0,1,20,0,1],maskEncoding:'rgb24',profiles:[{reference:128/255,high:1}],levels:[{level:1,width:1,height:1,offset:0,length:4},{level:0,width:2,height:2,offset:4,length:16}]},mask=new Uint8Array(16),preview=composePaint(original.subarray(4),layer,2,2),out=encodeTexture(texture,original,mask,['#808080'],{anchors:['#808080'],roles:[{kind:'cloth'}],paint:layer.payload()});
 for(let p=0;p<4;p++)assert.deepEqual([...out.subarray(16+p*4,20+p*4)],[preview[p*4+2],preview[p*4+1],preview[p*4],37]);assert.equal(out[15],73);assert.ok(out[14]>128);assert.ok(out[12]<128);
});

test('exporting from an animal form keeps the human revision and both independent palettes',()=>{
 const human={id:'nidalee-0',experimentVariant:'human-revision'},animal={id:'nidalee-0',experimentVariant:'cougar-revision',formContext:'cougar'},paint=new PaintLayer(1,1);paint.set(0,0xff112233);const state=color=>({method:'material-zones-v1',anchors:['#888888'],targets:[color],energy:color,effects:false,paintLayers:new Map()}),humanState=state('#2255aa'),animalState=state('#aa5522');animalState.paintLayers.set('fur',paint);const result=exportDesign(animal,new Map([[human.id,human]]),new Map([[stateKey(human),humanState],[stateKey(animal),animalState]]),{baseExport:'forms/exports/nidalee-0-base.json',options:[{id:'cougar',export:'forms/exports/cougar.json'}]},new Map([['nidalee-0:cougar',animal]]));
 assert.equal(result.palette.experimentVariant,'human-revision');assert.deepEqual(result.palette.targets,['#2255aa']);assert.deepEqual(result.palette.forms.cougar.targets,['#aa5522']);assert.equal(result.palette.forms.cougar.paint.fur.width,1);assert.deepEqual(result.palette.paint,{});assert.equal(result.descriptorPath,'forms/exports/nidalee-0-base.json');
});

test('form export packages both original paid definitions in the parent champion WAD',async()=>{
 const {fixture,unzip,unpackWad,wadResource}=await import('./export-fixtures.mjs'),human=await fixture('Test',7),animal=await fixture('TestBeast',7),descriptor=human.descriptor,palette={...human.palette,forms:{beast:{anchors:['#808080'],targets:['#aa5522'],energy:'#aa5522',effects:false}}},child={...animal.descriptor,archiveChampion:'Test'};
 child.source={...child.source,asset:'beast.bin',path:child.source.path.replace('WAD/TestBeast.','WAD/Test.')};descriptor.relatedForms=[{id:'beast',asset:'forms/beast.json'}];
 const result=await createFantome(descriptor,palette,{read:async path=>path==='forms/beast.json'?new TextEncoder().encode(JSON.stringify(child)):path==='beast.bin'?animal.raw:human.raw}),entries=unzip(await result.blob.arrayBuffer()),wad=unpackWad(entries.get('WAD/Test.wad.client'));
 assert.deepEqual(await wadResource(wad,'data/characters/test/skins/skin7.bin'),human.raw);assert.deepEqual(await wadResource(wad,'data/characters/testbeast/skins/skin7.bin'),animal.raw);assert.equal(await wadResource(wad,'data/characters/test/skins/skin0.bin'),undefined);assert.equal([...entries.keys()].some(path=>path.startsWith('WAD/TestBeast.')),false);
});
