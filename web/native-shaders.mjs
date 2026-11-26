import {preserveDetail,hexRgb} from './detail-colour.mjs';
import {preparePartFinish,finishPartColour} from './part-finish.mjs';
const packed=`
float r=texture2D(nDiffuse_Texture,vMapUv*pBase_Tile.xy+nativeTime*pScrollSpeedBase.xy).r;
float g=texture2D(nDiffuse_Texture,vMapUv*pBlend_Tile.xy+nativeTime*pScrollSpeedBlend.xy).g;
float b=texture2D(nDiffuse_Texture,vMapUv).b*pMaskStrength.x;
vec3 pattern=(r*pBaseMat_Tint.rgb+g*pBlendMat_Tint.rgb)*pTintColor.rgb;
`;
const packedMain=packed+`vec4 m=texture2D(nMain_Texture,vMapUv*pMainTex_Tile.xy);float am=mix(m.a,1.0,pMaintex_Alpha_Strength.x);`;
const programs={
 packed110:packed+`diffuseColor.rgb=b*pattern;diffuseColor.a=clamp(clamp(b*clamp(r*pBaseMat_Tint.a+g*pBlendMat_Tint.a,0.0,1.0)*pTintColor.a,0.0,1.0)-pAlpha_Control.x,0.0,1.0);`,
 packed123:packed+`diffuseColor.rgb=mix(g*pBlendMat_Tint.rgb,r*pBaseMat_Tint.rgb,b*.5)*pTintColor.rgb;diffuseColor.a=clamp(clamp(b*clamp(r*pBaseMat_Tint.a+g*pBlendMat_Tint.a,0.0,1.0)*pTintColor.a,0.0,1.0)-pAlpha_Control.x,0.0,1.0);`,
 packed327:packedMain+`float f=1.0-nativeSmooth(clamp(pOutlineControl.x,0.0,1.0),clamp(pOutlineControl.x,0.0,1.0)+pOutlineControl.y,nativeNDV());vec4 mainColour=mix(m*pMainTex_TintColor,pOutlineColor,f);float mainAlpha=clamp(mainColour.a+1.0,0.0,1.0);diffuseColor.rgb=.5*(mainColour.rgb+b*pattern);diffuseColor.a=clamp(clamp(clamp(mainAlpha+am,0.0,1.0)*pMainTex_TintColor.a*am,0.0,1.0)-pAlpha_Control.x,0.0,1.0);`,
 packed174:packedMain+`float q=clamp(m.a*pMainTex_TintColor.a+1.0,0.0,1.0);diffuseColor.rgb=m.rgb*pMainTex_TintColor.rgb+pattern;diffuseColor.a=clamp(clamp(clamp(m.r*pMainTex_TintColor.r*pattern.r*q+am,0.0,1.0)*pMainTex_TintColor.a*am,0.0,1.0)-pAlpha_Control.x,0.0,1.0);`,
 packed181:packedMain+`pattern*=b;float q=clamp(m.a*pMainTex_TintColor.a+1.0,0.0,1.0);diffuseColor.rgb=m.rgb*pMainTex_TintColor.rgb+pattern;diffuseColor.a=clamp(clamp(clamp(m.r*pMainTex_TintColor.r*pattern.r*q+am,0.0,1.0)*pMainTex_TintColor.a,0.0,1.0)-pAlpha_Control.x,0.0,1.0);`,
 packed322:packedMain+`pattern*=b;float f=1.0-nativeSmooth(clamp(pOutlineControl.x,0.0,1.0),clamp(pOutlineControl.x,0.0,1.0)+pOutlineControl.y,nativeNDV());vec4 mainColour=mix(m*pMainTex_TintColor,pOutlineColor,f);float q=clamp(mainColour.a+1.0,0.0,1.0);diffuseColor.rgb=mainColour.rgb+pattern;diffuseColor.a=clamp(clamp(clamp(mainColour.r*pattern.r*q+am,0.0,1.0)*pMainTex_TintColor.a,0.0,1.0)-pAlpha_Control.x,0.0,1.0);`,
 packed527:packedMain+`float om=texture2D(nOutlineMask_Texture,vMapUv).g*pOutlineMask_Strength.x;float f=1.0-nativeSmooth(clamp(om*pOutlineControl.x,0.0,1.0),clamp(om*pOutlineControl.x,0.0,1.0)+om*pOutlineControl.y,nativeNDV());vec3 base=mix(m.rgb*pMainTex_TintColor.rgb,om*pOutlineColor.rgb,f);diffuseColor.rgb=m.rgb*(base+pattern);diffuseColor.a=clamp(clamp(clamp(r*pBaseMat_Tint.a+g*pBlendMat_Tint.a,0.0,1.0)*pTintColor.a*am,0.0,1.0)-pAlpha_Control.x,0.0,1.0);`,
 multilayer20:`vec4 d=texture2D(nDiffuse_Texture,vMapUv);vec4 top=texture2D(nTop_Texture,vMapUv*pTop_UVScale.xy+nativeTime*pTop_ScrollSpeed.xy);vec4 bottom=texture2D(nBottom_Texture,vMapUv*pBottom_UVScale.xy+nativeTime*pBottom_ScrollSpeed.xy);vec4 mask=texture2D(nAlpha_Mask,vMapUv);float mr=clamp(mask.g+pAlpha_Bias.x,0.0,1.0);float mr2=texture2D(nAlpha_Mask,vMapUv*pAlpha_Scale.xy+nativeTime*pAlpha_Rate.xy).r;float ad=d.a*pDiffuse_AlphaIntensity.x;float at=clamp(ad*top.a*pTop_AlphaIntensity.x-mask.b,0.0,1.0);float ab=clamp(ad*bottom.a*pBottom_AlphaIntensity.x-mask.b,0.0,1.0);diffuseColor.rgb=mix(mix(d.rgb,bottom.rgb,ab),top.rgb,at)*pDiffuse_Tint.rgb;diffuseColor.a=nativeSmooth(pAlpha_Bounds.x,pAlpha_Bounds.y,mr*(mr+mr2));`,
 harrowing7:`float ndv=dot(normalize(qualityNormal),normalize(qualityView));float fc=ndv<0.0?1.0:1.0-min(pow(ndv,pColor_Fresnel.x),1.0);float fa=ndv<0.0?1.0:1.0-min(pow(ndv,pAlphaFresnel_Size.x),1.0);vec4 mask=texture2D(nMask_Texture,vMapUv);float moving=texture2D(nMask_Texture,vMapUv*vec2(pX_Scale.x,pY_Scale.x)+nativeTime*vec2(pX_Speed.x,pY_Speed.x)).r;vec3 gradient=texture2D(nGredient_Texture,vec2(fc,0.0)).rgb;vec4 d=texture2D(nDiffuse_Texture,vMapUv);diffuseColor.rgb=clamp(mix(d.rgb,gradient,fc*mask.b),0.0,1.0);diffuseColor.a=clamp(d.a+mask.r*clamp(fa*pAlphaFresnel_Bias.x,0.0,1.0)+mask.g*moving,0.0,1.0);`,
 layers9:`vec4 d=texture2D(nDiffuse_Texture,vMapUv);vec4 bottom=texture2D(nBottom_Texture,vMapUv+nativeTime*pBottom_ScrollSpeed.xy);vec4 top=texture2D(nTop_Texture,vMapUv*pTop_Tile.xy+nativeTime*pTop_ScrollSpeed.xy);diffuseColor.rgb=mix(mix(d.rgb,bottom.rgb,d.a*bottom.a),top.rgb,d.a*top.a);diffuseColor.a=1.0;`,
 scrollAlpha5:`vec4 c=texture2D(nScrolling_Texture,vMapUv*pUV_Scale.xy+nativeTime*pScroll_Speed.xy);float a=texture2D(nAlpha_Texture,vMapUv).r;diffuseColor.rgb=c.rgb*pTint_Color.rgb;diffuseColor.a=clamp(c.a*a-pAlpha_Control.x,0.0,1.0);`,
 panning5:`vec4 d=texture2D(nDiffuse_Texture,vMapUv);vec4 p=texture2D(nPanning_Texture,vMapUv*pPanning_Scale.xy+nativeTime*pPanning_Speed.xy);diffuseColor.rgb=d.rgb*p.rgb;diffuseColor.a=clamp(d.a*p.a-pAlpha_Control.x,0.0,1.0);`,
 fresnelScroll16:`vec4 d=texture2D(nDiffuse_Texture,vMapUv);float noise=texture2D(nMask_Texture,vMapUv*pNoise_Scale.xy+nativeTime*pNoise_ScrollSpeed.xy).r;float ndv=clamp(dot(normalize(qualityNormal),normalize(qualityView)),0.0,1.0);float f=clamp(1.0-pow(ndv,pFresnel_Size.x)+pAlpha_Bias.x,0.0,1.0);float a=clamp(f+noise,0.0,1.0);a=mix(a,1.0,clamp(d.a*pDiffuse_Alpha_Override.x,0.0,1.0));diffuseColor.a=clamp(a*pAlpha_Override.x,0.0,1.0);float c=clamp(pow(max(ndv,.0001),pFresnelColor_Size.x)+pFresnelColor_Bias.x,0.0,1.0);diffuseColor.rgb=mix(pFresnel_Color.rgb,d.rgb,c);`,
 matrix7:`vec2 pos=(vMapUv-.5)*pUV_Tile.xy+.5*pUV_Offset.xy*pUV_Tile.xy+.5;vec2 size=max(pFlipbook_Size.xy,vec2(1.0));float frame=floor(pFrame_Index.x+nativeTime*pFlipbook_Speed.x);vec2 index=fract(vec2(frame/size.x,floor(frame/size.x)/size.y));vec4 c=texture2D(nFlipbook,fract(pos)/size+index);float inside=step(abs(floor(pos).x)+abs(floor(pos).y),.5);diffuseColor.rgb=c.rgb*inside;diffuseColor.a=clamp(c.a,0.0,1.0);`,
 matcap8:`vec3 n=normalize(qualityNormal),v=normalize(qualityView);vec3 axis=normalize(vec3(v.z,0.0,-v.x)),up=cross(v,axis);vec2 uv=vec2(dot(axis,n),dot(up,n))*.5+.5;vec4 c=texture2D(nMatCap_03,clamp(uv,vec2(.001),vec2(.999)));float ndv=clamp(dot(n,v),0.0,1.0);vec3 light=qualityLight+qualityView;float distance=length(light)/max(qualityScale,.00001);float attenuation=clamp(1.0-sqrt(max((distance-pLNearAtten.x)/max(.001,pLFarAtten.x-pLNearAtten.x),0.0)),0.0,1.0);float highlight=max(dot(n,normalize(light)),0.0)*attenuation*texture2D(nMask,vMapUv).r;diffuseColor.rgb=mix(c.rgb,pTrans_Color.rgb,highlight);diffuseColor.a=clamp(c.a*(pow(ndv,pFresnel_Size.x)+.275)-pAlpha_Control.x,0.0,1.0);`
};
programs.multilayer18=programs.multilayer20.replace('clamp(ad*top.a*pTop_AlphaIntensity.x-mask.b,0.0,1.0)','ad*top.a*pTop_AlphaIntensity.x').replace('clamp(ad*bottom.a*pBottom_AlphaIntensity.x-mask.b,0.0,1.0)','ad*bottom.a*pBottom_AlphaIntensity.x');
programs.packed340=programs.packed322;
const one=new Set(['TintColor','Tint_Color','BaseMat_Tint','BlendMat_Tint','MainTex_TintColor','Diffuse_Tint','MaskStrength','Diffuse_AlphaIntensity','Top_AlphaIntensity','Bottom_AlphaIntensity','Color_Fresnel','AlphaFresnel_Size','AlphaFresnel_Bias','X_Scale','Y_Scale','Alpha_Override','Fresnel_Size']);
export function shaderProgram(recipe){return programs[recipe]??null}
export function shaderBindings(recipe){const body=shaderProgram(recipe);if(!body)throw Error('Unsupported native material.');return{body,parameters:[...new Set([...body.matchAll(/\bp([A-Z]\w*)/g)].map(match=>match[1]))],samplers:[...new Set([...body.matchAll(/\bn([A-Z]\w*)/g)].map(match=>match[1]))]}}
export function parameterDefault(name){return /Tile|UVScale|Alpha_Scale|UV_Scale|Noise_Scale|Flipbook_Size/.test(name)?[1,1,0,0]:one.has(name)?[1,1,1,1]:[0,0,0,0]}
export function installNativeShader(THREE,material,policy,samplers){
 const bindings=shaderBindings(policy.recipe),uniforms={nativeTime:{value:0}};
 for(const name of [...bindings.parameters,...(policy.recipe==='matcap8'?['LightPos']:[])])uniforms['p'+name]={value:new THREE.Vector4().fromArray(policy.parameters[name]??parameterDefault(name))};
 for(const name of bindings.samplers){if(!samplers[name])throw Error('Missing native sampler: '+name);uniforms['n'+name]={value:samplers[name].original}}
 material.userData.nativePolicy=policy;material.userData.nativeUniforms=uniforms;material.userData.nativeSamplers=samplers;
 material.customProgramCacheKey=()=>policy.recipe;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader='varying vec3 qualityNormal;varying vec3 qualityView;\n'+shader.vertexShader;
  if(policy.recipe==='matcap8')shader.vertexShader='uniform vec4 pLightPos;varying vec3 qualityLight;varying float qualityScale;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
vec3 qualityN=normal;
#ifdef USE_SKINNING
mat4 qualitySkin=skinWeight.x*boneMatX+skinWeight.y*boneMatY+skinWeight.z*boneMatZ+skinWeight.w*boneMatW;
qualityN=(bindMatrixInverse*qualitySkin*bindMatrix*vec4(qualityN,0.0)).xyz;
#endif
qualityNormal=normalMatrix*qualityN;qualityView=-mvPosition.xyz;`);
  if(policy.recipe==='matcap8')shader.vertexShader=shader.vertexShader.replace('qualityView=-mvPosition.xyz;','qualityView=-mvPosition.xyz;qualityLight=(modelViewMatrix*vec4(pLightPos.xyz,1.0)).xyz;qualityScale=length(modelMatrix[0].xyz);');
  const declarations=bindings.parameters.map(name=>'uniform vec4 p'+name+';').join('\n')+bindings.samplers.map(name=>'uniform sampler2D n'+name+';').join('\n');
  shader.fragmentShader='uniform float nativeTime;varying vec3 qualityNormal;varying vec3 qualityView;\n'+declarations+'\nfloat nativeSmooth(float a,float b,float x){return abs(b-a)<.000001?step(a,x):smoothstep(a,b,x);}\nfloat nativeNDV(){return max(dot(normalize(qualityNormal),normalize(qualityView)),.001);}\n'+shader.fragmentShader;
  if(policy.recipe==='matcap8')shader.fragmentShader='varying vec3 qualityLight;varying float qualityScale;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',bindings.body);
 };
 return material;
}

export function updateNativeMaterials(mesh,state,{original=false,time=0}={}){
 for(const material of mesh?.material??[]){
  const policy=material.userData.nativePolicy,uniforms=material.userData.nativeUniforms;if(!policy)continue;
  uniforms.nativeTime.value=time;
  for(const [name,item] of Object.entries(material.userData.nativeSamplers)){
   if(!uniforms['n'+name])continue;
   if(item.record&&item.version!==item.record.texture.version){for(let p=0;p<item.pixels.length;p+=4){item.pixels[p]=item.record.pixels.data[p];item.pixels[p+1]=item.record.pixels.data[p+1];item.pixels[p+2]=item.record.pixels.data[p+2]}item.changed.needsUpdate=true;item.version=item.record.texture.version}
   uniforms['n'+name].value=original?item.original:item.changed;
  }
  for(const [name,index] of Object.entries(policy.colourZones??{})){
   const value=policy.parameters[name],target=state.targets[index],anchor=state.anchors[index];
   const settings=state.partFinishes?.[index],part=settings?preparePartFinish(settings):null;
   if(original||target===anchor&&(!part||!part.graded))uniforms['p'+name].value.fromArray(value);
   else{const peak=Math.max(...value.slice(0,3)),maximum=peak>=1/255?peak:1,source=value.slice(0,3).map(v=>v/maximum);let rgb=target===anchor?source:state.colourMode==='preserve'?preserveDetail(source,hexRgb(anchor),hexRgb(target)):hexRgb(target);if(part)rgb=finishPartColour(rgb,source,source,null,part);uniforms['p'+name].value.set(...rgb.map(v=>v*maximum),value[3])}
  }
 }
}
