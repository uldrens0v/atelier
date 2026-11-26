import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from '../web/vendor/three.module.js';
import {selectionPane,selectionRectangle,selectionPixels,rolesFromPixels,rectangleSelection} from '../web/rectangle-selection-data.mjs';
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../web/vendor/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context)}});
const {rectangleGeometry,rectangleMaterial}=await import('../web/rectangle-picker.mjs');
const {RectangleSelection}=await import('../web/rectangle-selection.mjs');

test('rectangles work in every drag direction and remain inside their original comparison pane',()=>{
 const bounds={left:20,top:40,width:801,height:500},pane=selectionPane(bounds,true,700);
 assert.equal(pane.left,420);assert.equal(pane.width,401);
 const rect=selectionRectangle({x:700,y:400},{x:-100,y:-50},pane);assert.deepEqual(rect,{left:420,top:40,right:700,bottom:400,width:280,height:360});
 assert.deepEqual(selectionPixels(rect,pane,802,1000),{x:0,y:280,width:560,height:720});
 assert.deepEqual(selectionRectangle({x:700,y:400},{x:900,y:700},pane),{left:700,top:400,right:821,bottom:540,width:121,height:140});
 assert.equal(selectionPane(bounds,true,100).right,420);assert.equal(selectionPane(bounds,false,700).width,801);
});
test('visible piece IDs ignore background and invalid controls and additive rectangles never toggle existing parts off',()=>{
 const pixels=new Uint8Array([0,0,0,0,1,0,0,255,1,0,0,255,0,1,0,255,255,255,255,255]);assert.deepEqual(rolesFromPixels(pixels,500),[0,255]);
 assert.deepEqual(rectangleSelection([4,2],[2,7],true),[4,2,7]);assert.deepEqual(rectangleSelection([4,2],[7],false),[7]);assert.deepEqual(rectangleSelection([4,2],[],true),[4,2]);assert.deepEqual(rectangleSelection([4,2],[],false),[]);
});
test('selection geometry assigns constant IDs per triangle without changing the source geometry or skin weights',()=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));geometry.setIndex([0,1,2,0,2,3]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
 const output=rectangleGeometry({geometry,userData:{nativeTriangleRoles:[1,257]}});assert.deepEqual([...output.getAttribute('selectionRole').array],[1,1,1,257,257,257]);assert.equal(output.index,null);assert.equal(output.getAttribute('skinWeight').count,6);assert.equal(geometry.getAttribute('position').count,4);assert.equal(geometry.getAttribute('selectionRole'),undefined);assert.deepEqual(output.groups,geometry.groups);
});
test('ID rendering retains native transparency shaders and writes exact IDs without display colour transforms',()=>{
 const source=new THREE.MeshBasicMaterial({alphaTest:.25,opacity:.8});let inherited=false;source.onBeforeCompile=shader=>{inherited=true;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','diffuseColor.a=0.0;')};
 const material=rectangleMaterial(source,false),shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>\n#include <tonemapping_fragment>'};material.onBeforeCompile(shader,{});
 assert.equal(inherited,true);assert.match(shader.fragmentShader,/diffuseColor.a=0.0/);assert.match(shader.fragmentShader,/diffuseColor.a<=.01/);assert.equal(shader.fragmentShader.includes('colorspace_fragment'),false);assert.equal(material.depthWrite,true);assert.equal(rectangleMaterial(source,true).depthWrite,false);assert.match(shader.vertexShader,/selectedRole=selectionRole/);
});
function setup(){
 const listeners=new Map(),windowListeners=new Map(),box={style:{},hidden:true,classList:{toggle(){}},setAttribute(){}},canvas={width:800,style:{cursor:'default'},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),addEventListener:(name,callback)=>listeners.set(name,callback),setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){}},context={renderer:{getPixelRatio:()=>1},controls:{enabled:true,autoRotate:true,enableDamping:true,update(){}},player:{playing:true,syncPlay(){}},selection:[1],split:false,count:10};
 globalThis.document={createElement:()=>box,body:{appendChild(){}}};globalThis.window={addEventListener:(name,callback)=>windowListeners.set(name,callback)};
 const selections=[],selector=new RectangleSelection({canvas,getContext:()=>context,onSelection:(indices,additive)=>selections.push({indices,additive})});selector.picker={select:()=>[3],clear(){}};
 const event=(x,y,extra={})=>({clientX:x,clientY:y,button:0,ctrlKey:true,shiftKey:false,pointerId:1,preventDefault(){},stopImmediatePropagation(){},...extra});return{selector,context,canvas,box,selections,event,windowListeners};
}
test('Ctrl dragging captures the gesture, pauses motion, selects the area and restores camera and playback',()=>{
 const {selector,context,box,selections,event}=setup();selector.down(event(100,100));assert.equal(context.controls.enabled,false);assert.equal(context.player.playing,false);selector.move(event(300,300));assert.equal(box.hidden,false);selector.up(event(300,300));assert.deepEqual(selections,[{indices:[3],additive:false}]);assert.equal(context.controls.enabled,true);assert.equal(context.controls.autoRotate,true);assert.equal(context.player.playing,true);assert.equal(box.hidden,true);
});
test('Ctrl Shift adds another rectangle, Escape cancels without selecting and a tiny click does not trigger area selection',()=>{
 let state=setup();state.selector.down(state.event(100,100,{shiftKey:true}));state.selector.up(state.event(200,200));assert.deepEqual(state.selections,[{indices:[1,3],additive:true}]);
 state=setup();state.selector.down(state.event(100,100));state.selector.move(state.event(300,300));state.windowListeners.get('keydown')({key:'Escape',preventDefault(){}});assert.deepEqual(state.selections,[]);assert.equal(state.context.player.playing,true);assert.equal(state.box.hidden,true);
 state=setup();state.selector.down(state.event(100,100));state.selector.up(state.event(101,101));assert.deepEqual(state.selections,[]);
});
