import test from 'node:test';
import assert from 'node:assert/strict';
import {createFantome,validateOriginalTarget} from '../web/fantome-engine.mjs';
import {fixture,nativeDefinition,unzip,unpackWad,wadResource} from './export-fixtures.mjs';
import {customExportName,exportFilename} from '../web/export-name.mjs';

test('paid chromas target their original skin and ship standard packed WAD with matching metadata',async()=>{
 const {descriptor,palette,raw}=await fixture(),result=await createFantome(descriptor,palette,{read:async()=>raw}),entries=unzip(await result.blob.arrayBuffer()),wad=unpackWad(entries.get('WAD/Test.wad.client'));
 assert.deepEqual(await wadResource(wad,'data/characters/test/skins/skin7.bin'),raw);assert.equal(await wadResource(wad,'data/characters/test/skins/skin0.bin'),undefined);
 const info=JSON.parse(new TextDecoder().decode(entries.get('META/info.json'))),metadata=JSON.parse(new TextDecoder().decode(entries.get('metadata.json'))),validation=JSON.parse(new TextDecoder().decode(entries.get('META/validation.json')));
 assert.equal(info.Name,metadata.name);assert.equal(info.Version,metadata.version);assert.match(info.Description,/must own this skin/);assert.equal(validation.target,'original');assert.equal(validation.requiresOriginalSkin,true);assert.equal(validation.skin,7);assert.equal([...entries.keys()].some(path=>path.startsWith('WAD/Test.wad.client/')),false);
});
test('legacy Classic descriptors and attempts to change the export slot are rejected',async()=>{
 const {descriptor,palette,raw}=await fixture();
 await assert.rejects(createFantome({...descriptor,version:1},palette),/Original-skin/);
 await assert.rejects(createFantome(descriptor,{...palette,target:'base'}),/Invalid chroma/);
 assert.throws(()=>validateOriginalTarget({...descriptor,source:{...descriptor.source,path:'WAD/Test.wad.client/data/characters/test/skins/skin0.bin'}}),/original skin/);
 assert.throws(()=>validateOriginalTarget(descriptor,nativeDefinition('Test',0)),/Classic/);
 assert.throws(()=>validateOriginalTarget(descriptor,nativeDefinition('Test',8)),/does not match/);
 await assert.rejects(createFantome(descriptor,palette,{read:async()=>new Uint8Array(raw.length)}),/incomplete/);
});

test('a custom chroma name reaches the loader metadata and the tagged original skin',async()=>{
 const {descriptor,palette,raw}=await fixture(),name='Qiyana pink hair';
 const result=await createFantome(descriptor,{...palette,exportName:'  '+name+'  '},{read:async()=>raw});
 const entries=unzip(await result.blob.arrayBuffer());
 const read=path=>JSON.parse(new TextDecoder().decode(entries.get(path)));
 assert.equal(result.filename,name+'.fantome');
 assert.equal(read('META/info.json').Name,name);
 assert.equal(read('metadata.json').name,name);
 assert.equal(read('META/validation.json').skin,7);
 assert.deepEqual(await wadResource(unpackWad(entries.get('WAD/Test.wad.client')),'data/characters/test/skins/skin7.bin'),raw);
 const original=await createFantome(descriptor,palette,{read:async()=>raw});
 const unnamed=await createFantome(descriptor,{...palette,exportName:'  '},{read:async()=>raw});
 assert.equal(unnamed.name,original.name);
 assert.match(unnamed.filename,/^recolor-.*\.fantome$/);
});

test('custom names preserve Unicode and generate portable filenames',()=>{
 assert.equal(customExportName('  Dragón  de\tJade  '),'Dragón de Jade');
 assert.equal(exportFilename('Qiyana: Pink/Gems','fallback.fantome'),'Qiyana- Pink-Gems.fantome');
 assert.equal(exportFilename('NUL.txt','fallback.fantome'),'Chroma NUL.txt.fantome');
 assert.equal(exportFilename('...','fallback.fantome'),'fallback.fantome');
});

test('expanded effect exports carry a new loader version and a source-specific filename',async()=>{
 const {descriptor,palette,raw}=await fixture(),old=await createFantome(descriptor,palette,{read:async()=>raw}),expanded=await createFantome({...descriptor,abilityVfx:{coverageVersion:2,abilities:[]}},palette,{read:async()=>raw}),entries=unzip(await expanded.blob.arrayBuffer()),info=JSON.parse(new TextDecoder().decode(entries.get('META/info.json'))),metadata=JSON.parse(new TextDecoder().decode(entries.get('metadata.json'))),validation=JSON.parse(new TextDecoder().decode(entries.get('META/validation.json')));
 assert.equal(info.Version,'2.1.0');assert.equal(metadata.version,info.Version);assert.equal(validation.abilityCoverageVersion,2);assert.notEqual(expanded.filename,old.filename);assert.equal(validation.requiresOriginalSkin,true);
});
test('a Classic recolor stays on Classic when Classic was the selected original skin',async()=>{
 const {descriptor,palette,raw}=await fixture('Test',0),result=await createFantome(descriptor,palette,{read:async()=>raw}),wad=unpackWad(unzip(await result.blob.arrayBuffer()).get('WAD/Test.wad.client'));assert.deepEqual(await wadResource(wad,'data/characters/test/skins/skin0.bin'),raw);
});
test('alternate forms cannot export a different paid skin slot',async()=>{
 const {descriptor,palette,raw}=await fixture(),child=await fixture('TestBeast',8);child.descriptor.archiveChampion='Test';child.descriptor.source.path=child.descriptor.source.path.replace('WAD/TestBeast.','WAD/Test.');descriptor.relatedForms=[{id:'beast',asset:'form.json'}];
 await assert.rejects(createFantome(descriptor,palette,{read:async path=>path==='form.json'?new TextEncoder().encode(JSON.stringify(child.descriptor)):raw}),/same original skin/);
});
