import {loadMaskData} from './mask-data.mjs';
import {assetUrl} from './resource-cache.mjs';
import {installNativeShader,shaderBindings} from './native-shaders.mjs';

export async function loadNativeMaterialAssets(THREE,skin,base,records){
 const cache=new Map(),groups=new Map(),owned=[];
 function texture(image){const value=new THREE.DataTexture(image.pixels,image.width,image.height);value.flipY=false;value.wrapS=value.wrapT=THREE.RepeatWrapping;value.magFilter=THREE.LinearFilter;value.minFilter=THREE.LinearMipmapLinearFilter;value.generateMipmaps=true;value.needsUpdate=true;owned.push(value);return value}
 try{
  await Promise.all(Object.entries(skin.previewMaterials??{}).map(async([name,policy])=>{
   if(!policy.recipe)return;const bindings=shaderBindings(policy.recipe),samplers={};
   await Promise.all(bindings.samplers.map(async key=>{
    const descriptor=policy.samplers[key];if(!descriptor)throw Error('Missing native texture: '+key);const identity=descriptor.image+':'+Boolean(descriptor.data);
    if(!cache.has(identity))cache.set(identity,(async()=>{const image=await loadMaskData(assetUrl(base+descriptor.image,skin.nativeParts?.revision)),original=texture(image);original.colorSpace=descriptor.data?THREE.NoColorSpace:THREE.SRGBColorSpace;const record=descriptor.data?null:records.find(record=>record.meta.id===descriptor.texture),pixels=new Uint8Array(image.pixels),changed=record?texture({...image,pixels}):original;if(record)changed.colorSpace=original.colorSpace;return{original,changed,pixels,record,version:-1}})());samplers[key]=await cache.get(identity);
   }));groups.set(name,samplers);
  }));
  return{groups,dispose(){for(const item of owned)item.dispose()}};
 }catch(error){for(const item of owned)item.dispose();throw error}
}

export function materialOptions(THREE,policy={},map){
 const options={map,side:policy.side==='back'?THREE.BackSide:policy.side==='front'?THREE.FrontSide:THREE.DoubleSide,alphaTest:policy.alphaTest??.25};
 if(policy.colour)options.color=new THREE.Color().setRGB(...policy.colour);
 if(policy.transparent){options.transparent=true;options.depthWrite=policy.depthWrite??false}
 if(policy.opacity!==undefined)options.opacity=policy.opacity;
 if(policy.blend==='additive')options.blending=THREE.AdditiveBlending;
 return options;
}

export function configureMaterial(THREE,material,policy={},samplers){
 if(policy.recipe)return installNativeShader(THREE,material,policy,samplers);
 if(!policy.ignoreTextureAlpha&&!policy.fresnel)return material;
 material.customProgramCacheKey=()=>JSON.stringify(policy);
 material.onBeforeCompile=shader=>{
  if(policy.ignoreTextureAlpha)shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.a=opacity;');
  if(policy.fresnel){
   const value=policy.fresnel;shader.uniforms.qualityBase={value:new THREE.Vector4().fromArray(value.base)};shader.uniforms.qualityEdge={value:new THREE.Vector4().fromArray(value.edge)};shader.uniforms.qualityControl={value:new THREE.Vector4().fromArray(value.control)};
   shader.vertexShader='varying vec3 qualityNormal;varying vec3 qualityView;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
vec3 qualityN=normal;
#ifdef USE_SKINNING
mat4 qualitySkin=skinWeight.x*boneMatX+skinWeight.y*boneMatY+skinWeight.z*boneMatZ+skinWeight.w*boneMatW;
qualityN=(bindMatrixInverse*qualitySkin*bindMatrix*vec4(qualityN,0.0)).xyz;
#endif
qualityNormal=normalMatrix*qualityN;qualityView=-mvPosition.xyz;`);
   shader.fragmentShader='uniform vec4 qualityBase;uniform vec4 qualityEdge;uniform vec4 qualityControl;varying vec3 qualityNormal;varying vec3 qualityView;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
float qualityF=pow(clamp(1.0-abs(dot(normalize(qualityNormal),normalize(qualityView))),0.0,1.0),max(.001,qualityControl.y));
vec4 qualitySurface=mix(qualityBase,qualityEdge,qualityF);diffuseColor.rgb=qualitySurface.rgb;diffuseColor.a=qualitySurface.a;`);
  }
 };
 return material;
}
