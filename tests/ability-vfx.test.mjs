import test from 'node:test';
import assert from 'node:assert/strict';
import {abilityRgb,abilityTexturePixels,colourNativeSystem,applyAbilityColours,applyAbilityResolverBindings,applyAbilityTextureBindings,migrateAbilityVfx,validateAbilityVfx} from '../web/ability-colour.mjs';
import {sampleValue,integrateValue,phaseOrigin,phaseStart,particleSample,emissionTimes} from '../web/vfx-math.mjs';
import {paletteSnapshot} from '../web/edit-history.mjs';
const pink={enabled:true,colour:'#e36bc5',saturation:1,tintHighlights:false};
test('saved colors follow reviewed aliases while a direct component adjustment takes precedence',()=>{
 const beam={...pink,colour:'#00ddfa'},original={oldReturn:pink,beam,retired:pink};
 const profile={abilities:[{id:'beam'},{id:'impact'}],legacyAbilityIds:{oldReturn:['beam','impact'],retired:[]}};
 assert.deepEqual(migrateAbilityVfx(original,profile),{beam,impact:pink});
 assert.deepEqual(original,{oldReturn:pink,beam,retired:pink});
 assert.throws(()=>validateAbilityVfx(migrateAbilityVfx({unknown:pink},profile),profile),/not prepared/);
});
test('ability recolouring keeps neutral highlights, source intensity, black and texture alpha',()=>{
 assert.deepEqual(abilityRgb([2,2,2],pink),[2,2,2]);assert.deepEqual(abilityRgb([0,0,0],pink),[0,0,0]);assert.equal(Math.max(...abilityRgb([0,3,2],pink)),3*227/255);
 const source=Uint8Array.from([0,255,160,25,255,255,255,201,0,0,0,0]),changed=abilityTexturePixels(source,pink);assert.equal(changed[3],25);assert.deepEqual([...changed.slice(4)],[255,255,255,201,0,0,0,0]);assert.ok(changed[0]>changed[1]);assert.equal(source[0],0);
});
test('native colour curves change RGB without recolouring four-key times, probabilities or alpha',()=>{
 const source={Color:{constantValue:[0,1,1,.4],dynamics:{times:[0,.1,.5,1],values:[[0,1,1,0],[0,.2,.5,.5]],probabilityTables:[{keyTimes:[0,.2,.4,1],keyValues:[0,.1,.8,1]}]}},velocity:{constantValue:[0,1,1,1]}},changed=colourNativeSystem(source,pink);
 assert.notEqual(changed.Color.constantValue[0],0);assert.deepEqual(changed.Color.dynamics.times,source.Color.dynamics.times);assert.deepEqual(changed.Color.dynamics.probabilityTables,source.Color.dynamics.probabilityTables);assert.equal(changed.Color.dynamics.values[1][3],.5);assert.deepEqual(changed.velocity,source.velocity);assert.equal(source.Color.constantValue[0],0);
});
test('binary ability colours verify their source and change only registered RGB channels',()=>{
 const source=new Uint8Array(40),view=new DataView(source.buffer);[0,1,1,.25].forEach((value,i)=>view.setFloat32(4+i*4,value,true));source.set([0,255,180,87],25);const profile={abilities:[{id:'q',slots:[{offset:4,format:'f32',rgba:[0,1,1,.25]},{offset:25,format:'u8',rgba:[0,255,180,87]}]}]},changed=applyAbilityColours(source,profile,{q:pink}),allowed=new Set([...Array.from({length:12},(_,i)=>4+i),25,26,27]);
 for(let i=0;i<source.length;i++)if(!allowed.has(i))assert.equal(changed[i],source[i]);assert.notDeepEqual(changed,source);assert.throws(()=>applyAbilityColours(new Uint8Array(40),profile,{q:pink}),/does not match/);assert.throws(()=>validateAbilityVfx({w:pink},profile),/not prepared/);assert.throws(()=>validateAbilityVfx({q:{...pink,colour:'pink'}},profile),/Invalid/);
});
test('native particle values distinguish replacement curves, multipliers and integrated motion',()=>{
 assert.equal(sampleValue({constantValue:3,dynamics:{_type:'VfxAnimatedFloatVariableData',times:[0,1],values:[2,4]}},.5),3);assert.equal(sampleValue({constantValue:3,dynamics:{_type:'VfxAnimatedFloat',times:[0,1],values:[2,4]}},.5),9);
 assert.equal(integrateValue({constantValue:4},.5,2),8);assert.ok(Math.abs(integrateValue({dynamics:{times:[0,1],values:[0,2]}},.5,2)-.5)<1e-6);
 const ability={castTime:.25,speed:2000,range:1200};assert.deepEqual(phaseOrigin('flight',.55,ability),[0,600.0000000000001,120]);assert.equal(phaseStart('impact',ability),.85);assert.deepEqual(phaseOrigin('flight',2,ability),[0,1200,120]);
});
test('particles follow the shared native timeline, support legacy spawn values and deterministic bursts',()=>{
 const ability={castTime:.25,speed:2000,range:1200},emitter={particleLifetime:{constantValue:1},SpawnShape:{_type:'VfxShapeLegacy',emitOffset:{constantValue:[0,0,20]}},bindWeight:{constantValue:1},birthScale0:{constantValue:[3,4,5]},isUniformScale:true,isSingleParticle:true,rate:{constantValue:4}};
 assert.deepEqual(emissionTimes(emitter,.6),[0,0,0,0]);assert.equal(particleSample(emitter,0,-.01,1,ability,'flight'),null);const sample=particleSample(emitter,0,.3,1,ability,'flight');assert.deepEqual(sample.size,[3,3,3]);assert.equal(sample.position[2],140);assert.ok(Math.abs(sample.position[1]-600)<1e-6);assert.deepEqual(sample,particleSample(emitter,0,.3,1,ability,'flight'));
});
test('undo snapshots keep independent ability colour settings',()=>{
 const state={targets:['#123456'],abilityVfx:{q:{...pink}}},snapshot=paletteSnapshot(state);state.abilityVfx.q.colour='#ffffff';assert.equal(snapshot.abilityVfx.q.colour,pink.colour);
});
test('projectile textures bind only to the edited effect and inactive references stay original',()=>{
 const encoder=new TextEncoder(),original='assets/old/texture.tex',replacement='assets/av/abcdefg.tex_';assert.equal(original.length,replacement.length);const source=encoder.encode(original+'|'+original),profile={abilities:[{id:'first',textureBindingsApplied:false,bindings:[{offset:0,format:'string',original,replacement}]},{id:'second',textureBindingsApplied:false,bindings:[{offset:original.length+1,format:'string',original,replacement}]}]};
 const changed=applyAbilityTextureBindings(source,profile,{first:pink});assert.equal(new TextDecoder().decode(changed),replacement+'|'+original);assert.deepEqual(applyAbilityTextureBindings(source,profile,{}),source);assert.throws(()=>applyAbilityTextureBindings(new Uint8Array(source.length),profile,{first:pink}),/does not match/);
});
test('64-bit texture identities retain their exact bits and previously prepared textures can be disabled',()=>{
 const source=new Uint8Array(16),view=new DataView(source.buffer),original='18446744073709551001',replacement='17234567890123456789';view.setBigUint64(0,BigInt(original),true);view.setBigUint64(8,BigInt(replacement),true);const profile={abilities:[{id:'new',textureBindingsApplied:false,bindings:[{offset:0,format:'path',original,replacement}]},{id:'legacy',bindings:[{offset:8,format:'path',original,replacement}]}]},changed=applyAbilityTextureBindings(source,profile,{new:pink}),output=new DataView(changed.buffer);assert.equal(output.getBigUint64(0,true),BigInt(replacement));assert.equal(output.getBigUint64(8,true),BigInt(original));
});
test('persistent native missile meshes remain alive during flight and stop after impact',()=>{
 const ability={castTime:.25,speed:1200,range:1200},emitter={particleLifetime:{constantValue:-1},bindWeight:{constantValue:1},lifetime:1,birthScale0:{constantValue:[2,2,2]}};const sample=particleSample(emitter,0,.5,1,ability,'flight');assert.ok(sample);assert.equal(sample.normalized,0);assert.equal(sample.position[1],600);assert.equal(particleSample(emitter,0,1.1,1,ability,'flight'),null);
});
test('inactive projectile colours retain original effects for existing global finishes',()=>{
 const source=new Uint8Array(20),view=new DataView(source.buffer);view.setUint32(4,900,true);view.setUint32(8,901,true);view.setUint32(12,902,true);const profile={abilities:[{id:'q',resolverBindings:[{offset:4,original:100,replacement:900}]},{id:'w',resolverBindings:[{offset:8,original:101,replacement:901}]}],inactiveResolverBindings:[{offset:12,original:102,replacement:902}]},changed=applyAbilityResolverBindings(source,profile,{q:pink}),output=new DataView(changed.buffer);assert.equal(output.getUint32(4,true),900);assert.equal(output.getUint32(8,true),101);assert.equal(output.getUint32(12,true),102);assert.equal(view.getUint32(8,true),901);assert.throws(()=>applyAbilityResolverBindings(new Uint8Array(20),profile,{}),/does not match/);
});
