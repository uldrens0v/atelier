import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.js';
import {animatedMesh,animationClip,restorePose,motionRange} from '../web/animation-engine.mjs';

function fixture(){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1],3));geometry.setIndex([0,1,2]);const rig={version:1,vertices:3,indices:Buffer.from(new Uint16Array(12).buffer).toString('base64'),weights:Buffer.from(Float32Array.from({length:12},(_,i)=>i%4===0?1:0).buffer).toString('base64'),bones:[{hash:123,parent:-1,position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],inversePosition:[0,0,0],inverseRotation:[0,0,0,1],inverseScale:[1,1,1]}]};return{geometry,rig,mesh:animatedMesh(THREE,geometry,new THREE.MeshBasicMaterial(),rig)}}

test('native weights preserve bind pose and skeletal animation moves actual vertices',()=>{
 const {mesh}=fixture(),position=new THREE.Vector3(1,0,0);mesh.applyBoneTransform(0,position);assert.ok(position.distanceTo(new THREE.Vector3(1,0,0))<1e-6);
 const data={version:1,duration:1,tracks:[{bone:123,times:[0,1],positions:[0,0,0,0,2,0],rotations:[0,0,0,1],scales:[1,1,1]}]},clip=animationClip(THREE,data,mesh,'walk'),mixer=new THREE.AnimationMixer(mesh);mixer.clipAction(clip).play();mixer.update(.5);mesh.updateMatrixWorld(true);mesh.skeleton.update();position.set(1,0,0);mesh.applyBoneTransform(0,position);assert.ok(position.distanceTo(new THREE.Vector3(1,1,0))<1e-6);
 mixer.stopAllAction();restorePose(mesh);position.set(1,0,0);mesh.applyBoneTransform(0,position);assert.ok(position.distanceTo(new THREE.Vector3(1,0,0))<1e-6);
});

test('animation loading rejects mismatched weights and clips with no matching bones',()=>{
 const {mesh,geometry,rig}=fixture();assert.throws(()=>animatedMesh(THREE,geometry,mesh.material,{...rig,vertices:2}),/does not match/);assert.throws(()=>animationClip(THREE,{version:1,duration:1,tracks:[{bone:456,times:[0],positions:[0,0,0]}]},mesh,'bad'),/matching bones/);
});

test('death preview stops before the native body despawn without clamping source tracks',()=>{
 const {mesh}=fixture(),data={version:1,duration:1,tracks:[{bone:123,times:[0,.5,1],positions:[0,0,0,0,1,0,0,-1000000,0],rotations:[0,0,0,1],scales:[1,1,1]}]},original=JSON.stringify(data);
 assert.deepEqual(motionRange(data,mesh),{start:0,end:.5});const clip=animationClip(THREE,data,mesh,'death');assert.equal(clip.duration,.5);assert.equal(JSON.stringify(data),original);
 data.tracks[0].positions=[0,-1000000,0];assert.equal(motionRange(data,mesh),null);assert.throws(()=>animationClip(THREE,data,mesh,'auxiliary'),/game-only effects/);
});
