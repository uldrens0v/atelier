import * as THREE from 'three';
import {selectionPixels,rolesFromPixels} from './rectangle-selection-data.mjs';

export function rectangleGeometry(model){
 const source=model.geometry,geometry=source.index?source.toNonIndexed():source.clone(),roles=model.userData.nativeTriangleRoles,ids=new Float32Array(geometry.getAttribute('position').count);
 for(let face=0;face<ids.length/3;face++)ids.fill(roles[face]??0,face*3,face*3+3);
 geometry.setAttribute('selectionRole',new THREE.BufferAttribute(ids,1));return geometry;
}
export function rectangleMaterial(source,pickThrough){
 const material=new THREE.MeshBasicMaterial({map:source.map,alphaMap:source.alphaMap,alphaTest:source.alphaTest,side:source.side,opacity:source.opacity,vertexColors:source.vertexColors,transparent:false,depthWrite:!pickThrough,depthTest:true,blending:THREE.NoBlending,toneMapped:false});
 material.customProgramCacheKey=()=>source.customProgramCacheKey()+'-rectangle-'+source.uuid;
 material.onBeforeCompile=(shader,renderer)=>{
  source.onBeforeCompile(shader,renderer);
  shader.vertexShader='attribute float selectionRole;varying float selectedRole;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nselectedRole=selectionRole;');
  shader.fragmentShader='varying float selectedRole;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
if(diffuseColor.a<=.01)discard;
float selectedId=floor(selectedRole+.5);
gl_FragColor=vec4(mod(selectedId,256.0),mod(floor(selectedId/256.0),256.0),floor(selectedId/65536.0),255.0)/255.0;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','').replace('#include <tonemapping_fragment>','');
 };
 return material;
}
export class RectanglePicker{
 constructor(renderer){this.renderer=renderer;this.scene=new THREE.Scene();this.target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true,stencilBuffer:false});this.savedColor=new THREE.Color();this.model=null;this.objects=[]}
 clear(){for(const object of this.objects){this.scene.remove(object);object.material.forEach(material=>material.dispose())}this.geometry?.dispose();this.geometry=null;this.objects=[];this.model=null}
 setMesh(model){
  if(this.model===model)return;this.clear();this.model=model;this.geometry=rectangleGeometry(model);
  for(const pickThrough of [true,false]){
   const materials=model.material.map(source=>rectangleMaterial(source,pickThrough)),object=model.isSkinnedMesh?new THREE.SkinnedMesh(this.geometry,materials):new THREE.Mesh(this.geometry,materials);
   if(model.isSkinnedMesh){object.bind(model.skeleton,model.bindMatrix);object.bindMode=model.bindMode}
   object.matrixAutoUpdate=false;object.frustumCulled=false;object.renderOrder=pickThrough?0:1;object.userData.pickThrough=pickThrough;this.objects.push(object);this.scene.add(object);
  }
 }
 select(context,rect,pane){
  const {mesh,camera}=context;this.setMesh(mesh);mesh.updateWorldMatrix(true,false);camera.updateMatrixWorld();if(mesh.isSkinnedMesh)mesh.skeleton.update();
  for(const object of this.objects){object.matrix.copy(mesh.matrixWorld);if(mesh.isSkinnedMesh)object.bindMatrixInverse.copy(mesh.bindMatrixInverse);object.material.forEach((material,index)=>{const source=mesh.material[index];material.visible=source.visible&&source.opacity>0&&Boolean(source.userData.nativePolicy?.pickThrough)===object.userData.pickThrough;material.map=source.map;material.opacity=source.opacity;material.alphaTest=source.alphaTest})}
  const renderer=this.renderer,ratio=renderer.getPixelRatio(),width=Math.max(1,Math.round(pane.width*ratio)),height=Math.max(1,Math.round(pane.height*ratio)),region=selectionPixels(rect,pane,width,height);
  if(!region.width||!region.height)return [];
  if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
  const pixels=new Uint8Array(region.width*region.height*4),target=renderer.getRenderTarget(),autoClear=renderer.autoClear,alpha=renderer.getClearAlpha(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest(),xr=renderer.xr.enabled;renderer.getClearColor(this.savedColor);
  try{renderer.xr.enabled=false;renderer.setScissorTest(false);renderer.setRenderTarget(this.target);renderer.setClearColor(0,0);renderer.autoClear=true;renderer.render(this.scene,camera);renderer.readRenderTargetPixels(this.target,region.x,region.y,region.width,region.height,pixels)}
  finally{renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(this.savedColor,alpha);renderer.autoClear=autoClear;renderer.xr.enabled=xr}
  return rolesFromPixels(pixels,context.count);
 }
 dispose(){this.clear();this.target.dispose()}
}
