import * as THREE from 'three';

export function selectionIndices(geometry,triangleRoles,selection){
 const selected=new Set(selection.map(value=>value+1)),source=geometry.index.array,indices=[],groups=[];
 for(const group of geometry.groups){const start=indices.length;for(let i=group.start;i<group.start+group.count;i+=3)if(selected.has(triangleRoles[i/3]))indices.push(source[i],source[i+1],source[i+2]);groups.push({start,count:indices.length-start,materialIndex:group.materialIndex})}
 return {indices:new Uint32Array(indices),groups};
}

export class SelectionOutline{
 constructor(renderer){
  this.renderer=renderer;this.scene=new THREE.Scene();this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});this.size=new THREE.Vector2();this.savedColor=new THREE.Color();this.model=null;this.roles=null;this.key='';
  this.screenScene=new THREE.Scene();this.screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  this.compositeMaterial=new THREE.ShaderMaterial({uniforms:{mask:{value:this.target.texture},texel:{value:new THREE.Vector2(1,1)},radius:{value:1},color:{value:new THREE.Color('#eeeeef')}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D mask;uniform vec2 texel;uniform float radius;uniform vec3 color;varying vec2 vUv;
vec2 span(float r){float low=1.;float high=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float value=texture2D(mask,vUv+vec2(float(x),float(y))*texel*r).r;low=min(low,value);high=max(high,value);}return vec2(low,high);}
void main(){vec2 nearEdge=span(radius*1.25);vec2 farEdge=span(radius*2.5);float edge=nearEdge.y-nearEdge.x;float halo=farEdge.y-farEdge.x;float alpha=max(edge*.98,halo*.72);if(alpha<.01)discard;gl_FragColor=vec4(mix(vec3(.025),color,edge),alpha);
#include <colorspace_fragment>
}`,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.compositeMaterial);this.quad.frustumCulled=false;this.screenScene.add(this.quad);
 }
 clear(){
  if(this.occluder){this.scene.remove(this.occluder);this.occluder.material.forEach(material=>material.dispose())}
  if(this.selectedMesh){this.scene.remove(this.selectedMesh);this.selectedMesh.geometry.dispose();this.selectedMesh.material.forEach(material=>material.dispose())}
  this.model=null;this.roles=null;this.occluder=null;this.selectedMesh=null;this.key='';
 }
 setMesh(model,triangleRoles){
  this.clear();if(!model||!triangleRoles)return;this.model=model;this.roles=triangleRoles;
  const maskMaterials=(value,depthWrite)=>model.material.map(source=>{const material=new THREE.ShaderMaterial({uniforms:{map:{value:source.map},cutoff:{value:source.alphaTest},maskValue:{value}},vertexShader:'varying vec2 vUv;\n#include <common>\n#include <skinning_pars_vertex>\nvoid main(){vUv=uv;\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\ngl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);}',fragmentShader:'uniform sampler2D map;uniform float cutoff;uniform float maskValue;varying vec2 vUv;void main(){if(texture2D(map,vUv).a<cutoff)discard;gl_FragColor=vec4(vec3(maskValue),1.);}',side:source.side,depthTest:true,depthWrite,depthFunc:THREE.LessEqualDepth,toneMapped:false});material.visible=source.visible;return material});
  const occlusionMaterials=maskMaterials(0,true);
  const createMaskMesh=(geometry,materials)=>{if(!model.isSkinnedMesh)return new THREE.Mesh(geometry,materials);const mesh=new THREE.SkinnedMesh(geometry,materials);mesh.bind(model.skeleton,model.bindMatrix);mesh.bindMode=THREE.AttachedBindMode;return mesh};
  this.occluder=createMaskMesh(model.geometry,occlusionMaterials);this.occluder.matrixAutoUpdate=false;this.occluder.frustumCulled=false;this.occluder.renderOrder=0;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',model.geometry.getAttribute('position').clone());geometry.setAttribute('uv',model.geometry.getAttribute('uv').clone());if(model.isSkinnedMesh){geometry.setAttribute('skinIndex',model.geometry.getAttribute('skinIndex'));geometry.setAttribute('skinWeight',model.geometry.getAttribute('skinWeight'))}geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(model.geometry.index.count),1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const materials=maskMaterials(1,false);
  this.selectedMesh=createMaskMesh(geometry,materials);this.selectedMesh.matrixAutoUpdate=false;this.selectedMesh.frustumCulled=false;this.selectedMesh.renderOrder=1;this.scene.add(this.occluder,this.selectedMesh);
 }
 setSelection(selection){
  if(!this.model)return;const key=selection.slice().sort((a,b)=>a-b).join(',');if(key===this.key)return;this.key=key;const result=selectionIndices(this.model.geometry,this.roles,selection),geometry=this.selectedMesh.geometry;geometry.index.array.set(result.indices);geometry.index.needsUpdate=true;geometry.setDrawRange(0,result.indices.length);geometry.clearGroups();for(const group of result.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
 }
 render(camera,viewport=null){
  if(!this.model||!this.selectedMesh.geometry.drawRange.count)return;const renderer=this.renderer;renderer.getDrawingBufferSize(this.size);if(viewport)this.size.set(Math.round(viewport.width*renderer.getPixelRatio()),Math.round(viewport.height*renderer.getPixelRatio()));if(!this.size.x||!this.size.y)return;
  if(this.target.width!==this.size.x||this.target.height!==this.size.y)this.target.setSize(this.size.x,this.size.y);this.compositeMaterial.uniforms.texel.value.set(1/this.size.x,1/this.size.y);this.compositeMaterial.uniforms.radius.value=renderer.getPixelRatio();
  this.model.updateWorldMatrix(true,false);this.occluder.matrix.copy(this.model.matrixWorld);this.selectedMesh.matrix.copy(this.model.matrixWorld);if(this.model.isSkinnedMesh){this.occluder.bindMatrixInverse.copy(this.model.bindMatrixInverse);this.selectedMesh.bindMatrixInverse.copy(this.model.bindMatrixInverse)}
  const target=renderer.getRenderTarget(),autoClear=renderer.autoClear,alpha=renderer.getClearAlpha(),savedViewport=renderer.getViewport(new THREE.Vector4()),savedScissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();renderer.getClearColor(this.savedColor);
  try{renderer.setScissorTest(false);renderer.setRenderTarget(this.target);renderer.setClearColor(0,1);renderer.autoClear=true;renderer.render(this.scene,camera);renderer.setRenderTarget(target);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(this.savedColor,alpha);renderer.autoClear=false;renderer.render(this.screenScene,this.screenCamera)}finally{renderer.setRenderTarget(target);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(this.savedColor,alpha);renderer.autoClear=autoClear}
 }
}
