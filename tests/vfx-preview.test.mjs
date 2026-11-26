import test from 'node:test';
import assert from 'node:assert/strict';
import {erosionMask,lookupCoordinates,uvLayer,surfaceValues} from '../web/vfx-surface.mjs';
import {ribbonVertices} from '../web/vfx-ribbon.mjs';
import {travelDistance,flightDuration} from '../web/vfx-motion.mjs';
import {particleSample,particleRgba} from '../web/vfx-math.mjs';
test('native erosion is a linear two-edge band and respects the selected data channel',()=>{
 const definition={erosionMapChannelMixer:{constantValue:[1,0,0,0]},erosionSliceWidth:1.5,erosionFeatherIn:.1,erosionFeatherOut:.1},pixel=[.5,.9,.2,1];assert.equal(erosionMask(pixel,0,definition),1);assert.ok(Math.abs(erosionMask(pixel,.55,definition)-.5)<1e-10);assert.equal(erosionMask(pixel,2,definition),0);assert.equal(erosionMask(pixel,.6,{...definition,erosionMapChannelMixer:{constantValue:[0,1,0,0]}}),1);
});
test('colour lookup preserves independent lifetime, speed, constant and stable birth-random axes',()=>{
 const sample={normalized:.25,velocity:[3,4,0]};assert.deepEqual(lookupCoordinates({},sample,5),[.25,1]);assert.deepEqual(lookupCoordinates({colorLookUpTypeX:2,colorLookUpTypeY:0,colorLookUpScales:[.1,.3],colorLookUpOffsets:[.2,.7]},sample,5),[.7,.3]);const random=lookupCoordinates({colorLookUpTypeX:3,colorLookUpTypeY:3},sample,7);assert.equal(random[0],random[1]);assert.deepEqual(random,lookupCoordinates({colorLookUpTypeX:3,colorLookUpTypeY:3},{...sample,normalized:.8},7));
});
test('second texture UVs retain their own scroll, scale and rotation',()=>{
 const emitter={lifetime:1,textureMult:{birthUVOffsetMult:{constantValue:[.2,.3]},birthUvScrollRateMult:{constantValue:[2,-1]},UvRotationMult:{constantValue:90},uvScaleMult:{constantValue:[2,.5]}}},sample={age:.25,normalized:.5,life:.5};const uv=uvLayer(emitter,sample,0,5,true);assert.deepEqual(uv.offset,[.7,.04999999999999999]);assert.deepEqual(uv.scale,[2,.5]);assert.equal(uv.rotation,Math.PI/2);assert.deepEqual(uvLayer(emitter,sample,0,5).offset,[0,0]);
});
test('palette selection and erosion drive remain independent of particle colour',()=>{
 const emitter={alphaErosionDefinition:{erosionDriveCurve:{constantValue:.4}},paletteDefinition:{paletteCount:4,paletteSelector:{constantValue:[1,0,0]}}},value=surfaceValues(emitter,{age:.25,life:1,normalized:.25,velocity:[0,0,0]},7);assert.equal(value.drive,.4);assert.equal(value.row,.375);assert.deepEqual(value.mixer,[.299,.587,.114,0]);
});
test('ribbons join emitted points continuously, preserve wake UVs and truncate by arc length',()=>{
 const points=[0,10,20].map(value=>({position:[0,value,0],width:2,bornDistance:value,tiling:[10,0]})),vertices=ribbonVertices(points,{camera:[10,10,10],mode:1,cutoff:15});assert.equal(vertices.length,12);assert.equal(vertices[0].uv[0],2);assert.equal(vertices.at(-1).uv[0],.5);assert.ok(vertices.every(vertex=>vertex.position.every(Number.isFinite)));assert.deepEqual(vertices[2].position,vertices[4].position);assert.deepEqual(vertices[5].position,vertices[6].position);assert.ok(Math.abs(Math.hypot(...vertices[0].position.map((value,i)=>value-points[2].position[i]))-2)<1e-9);
});
test('arbitrary ribbon orientation is independent of the inspection camera',()=>{
 const points=[0,10].map(value=>({position:[0,value,0],width:3,bornDistance:value,tiling:[0,0]}));assert.deepEqual(ribbonVertices(points,{camera:[0,0,10],arbitrary:true}),ribbonVertices(points,{camera:[20,0,10],arbitrary:true}));assert.ok(ribbonVertices(points,{camera:[0,0,10],arbitrary:true}).every(vertex=>vertex.uv[0]===0));
});
test('native movement supports fixed flight times and bounded acceleration without changing the source range',()=>{
 const fixed={range:900,speed:10,movement:{_type:'FixedTimeMovement',mTravelTime:.75}};assert.equal(flightDuration(fixed),.75);assert.equal(travelDistance(.375,fixed),450);const speeding={range:500,speed:100,movement:{_type:'AcceleratingMovement',mInitialSpeed:100,mAcceleration:100,mMinSpeed:0,mMaxSpeed:200}};assert.equal(travelDistance(1,speeding),150);assert.ok(Math.abs(flightDuration(speeding)-2.75)<1e-9);const slowing={range:600,speed:300,movement:{_type:'AcceleratingMovement',mInitialSpeed:300,mAcceleration:-100,mMinSpeed:100,mMaxSpeed:300}};assert.equal(travelDistance(2,slowing),400);assert.ok(Math.abs(flightDuration(slowing)-4)<1e-9);
});
test('persistent missile particles keep their native alpha throughout flight',()=>{
 const emitter={particleLifetime:{constantValue:-1},birthColor:{constantValue:[1,.5,.2,.8]},lifetime:1,bindWeight:{constantValue:1}},ability={range:1200,speed:1200,castTime:.25};assert.equal(particleRgba(emitter,0,.5,1)[3],.8);assert.equal(particleSample(emitter,0,.5,1,ability,'flight').rgba[3],.8);
});
