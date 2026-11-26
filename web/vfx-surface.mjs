import {clamp,sampleValue,integrateValue,random,emitterPhaseAt} from './vfx-math.mjs';
export function erosionMask(pixel,drive,definition){
 const mixer=sampleValue(definition.erosionMapChannelMixer,0,1,[0,0,0,1]),value=clamp(pixel.reduce((sum,v,i)=>sum+v*mixer[i],0)),t=drive-value,width=definition.erosionSliceWidth??1.5,leading=definition.erosionFeatherIn??.1,trailing=definition.erosionFeatherOut??.1;
 return clamp((t+width)*(leading>1e-6?1/leading:1000))-clamp(t*(trailing>1e-6?1/trailing:0));
}
export function lookupCoordinates(emitter,sample,seed){
 const scales=emitter.colorLookUpScales??[1,1],offset=emitter.colorLookUpOffsets??[0,0],speed=Math.hypot(...sample.velocity),types=[emitter.colorLookUpTypeX??1,emitter.colorLookUpTypeY??0];
 return types.map((type,i)=>type===0||type>=4?scales[i]:scales[i]*(type===1?sample.normalized:type===2?speed:random(seed,20))+offset[i]);
}
export function uvLayer(emitter,sample,spawn,seed,mult=false){
 const phase=emitterPhaseAt(emitter,spawn),layer=mult?emitter.textureMult??{}:emitter,age=sample.age,t=sample.normalized;
 const offset=sampleValue(layer[mult?'birthUVOffsetMult':'birthUVOffset'],phase,seed,[0,0],true),scroll=sampleValue(layer[mult?'birthUvScrollRateMult':'birthUvScrollRate'],phase,seed,[0,0],true),integrated=integrateValue(layer[mult?'ParticleIntegratedUvScrollMult':'particleUVScrollRate'],t,sample.life,seed,[0,0]),emitterScroll=sampleValue(layer[mult?'emitterUvScrollRateMult':'emitterUvScrollRate'],t,seed,[0,0]);
 for(let i=0;i<2;i++){offset[i]+=scroll[i]*age;if(layer[mult?'uvScrollClampMult':'uvScrollClamp'])offset[i]=clamp(offset[i],-1,1);else offset[i]-=Math.floor(offset[i]);offset[i]+=integrated[i]+emitterScroll[i]*Math.max(0,age+spawn)}
 const scale=sampleValue(layer[mult?'uvScaleMult':'uvScale'],t,seed,[1,1]),rotation=sampleValue(layer[mult?'UvRotationMult':'uvRotation'],t,seed,0)+age*sampleValue(layer[mult?'birthUvRotateRateMult':'birthUvRotateRate'],phase,seed,0,true)+integrateValue(layer[mult?'ParticleIntegratedUvRotateMult':'particleUVRotateRate'],t,sample.life,seed,0);
 return{offset,scale,rotation:rotation*Math.PI/180};
}
export function surfaceValues(emitter,sample,seed){
 const erosion=emitter.alphaErosionDefinition,lingering=sample.age>sample.life&&erosion?.UseLingerErosionDriveCurve,drive=erosion?sampleValue(lingering?erosion.LingerErosionDriveCurve:erosion.erosionDriveCurve,lingering?clamp((sample.age-sample.life)/Math.max(.001,emitter.particleLinger??0)):sample.normalized,seed,1):0,palette=emitter.paletteDefinition,selector=sampleValue(palette?.paletteSelector,sample.normalized,seed,[0,0,0])[0],count=Math.max(1,palette?.paletteCount??1);
 return{drive,lookup:lookupCoordinates(emitter,sample,seed),row:(selector+.5)/count,mixer:sampleValue(palette?.palleteSrcMixColor,sample.normalized,seed,[.299,.587,.114,0])};
}
export const surfaceVertex=`
attribute vec4 particleColour;
attribute vec4 particleUV;
attribute vec4 particleUV2;
attribute vec2 particleTurn;
attribute vec4 surfaceData;
attribute vec4 paletteMix;
attribute float particlePaletteRow;
uniform vec2 baseDiv;
uniform vec2 secondDiv;
uniform vec2 baseCenter;
uniform vec2 secondCenter;
uniform vec2 baseFlip;
uniform vec2 secondFlip;
uniform bool meshSurface;
varying vec2 vUV;
varying vec2 vUV2;
varying vec2 vAlphaUV;
varying vec4 vColour;
varying vec4 vSurface;
varying vec4 vPaletteMix;
varying float vPaletteRow;
vec2 transformUV(vec2 p,vec4 layer,float turn,vec2 center,vec2 flip){
 p-=center;float c=cos(turn),s=sin(turn);p=mat2(c,s,-s,c)*p;p=p*layer.zw+center+layer.xy;return mix(p,1.0-p,flip);
}
void main(){
 vec2 a=transformUV(uv,particleUV,particleTurn.x,baseCenter,baseFlip);
 vec2 b=transformUV(uv,particleUV2,particleTurn.y,secondCenter,secondFlip);
 float frame=surfaceData.w;
 if(meshSurface){vUV=(a-particleUV.xy)*baseDiv+particleUV.xy;vUV2=(b-particleUV2.xy)*secondDiv+particleUV2.xy;vAlphaUV=uv*baseDiv;}
 else{vec2 cell=vec2(mod(frame,baseDiv.x),floor(frame/baseDiv.x));vUV=(a+cell)/baseDiv;vec2 cell2=vec2(mod(frame,secondDiv.x),floor(frame/secondDiv.x));vUV2=(b+cell2)/secondDiv;vAlphaUV=(transformUV(uv,vec4(0.0,0.0,particleUV.zw),particleTurn.x,baseCenter,baseFlip)+cell)/baseDiv;}
 vColour=particleColour;vSurface=surfaceData;vPaletteMix=paletteMix;vPaletteRow=particlePaletteRow;
 #ifdef RIBBON
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
 #else
 gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);
 #endif
}`;
export const surfaceFragment=`
uniform sampler2D image;
uniform sampler2D secondImage;
uniform sampler2D erosionImage;
uniform sampler2D lookupImage;
uniform sampler2D paletteImage;
uniform bool hasSecond;
uniform bool hasErosion;
uniform bool hasPalette;
uniform int lookupMode;
uniform bool lockedAlpha;
uniform bool premultiply;
uniform float alphaCutoff;
uniform vec3 erosionParams;
uniform vec4 erosionMixer;

varying vec2 vUV;
varying vec2 vUV2;
varying vec2 vAlphaUV;
varying vec4 vColour;
varying vec4 vSurface;
varying vec4 vPaletteMix;
varying float vPaletteRow;
void main(){
 vec4 texel=texture2D(image,vUV);
 if(lockedAlpha)texel.a=texture2D(image,vAlphaUV).a;
 if(hasPalette){float entry=clamp(dot(texel,vPaletteMix),0.0,1.0);texel.rgb=texture2D(paletteImage,vec2(entry,vPaletteRow)).rgb;}
 if(hasSecond)texel*=texture2D(secondImage,vUV2);
 if(hasErosion){float value=clamp(dot(texture2D(erosionImage,vUV),erosionMixer),0.0,1.0);float t=vSurface.x-value;texel.a*=clamp((t+erosionParams.x)*erosionParams.y,0.0,1.0)-clamp(t*erosionParams.z,0.0,1.0);}
 vec4 colour=vColour;if(premultiply){colour.rgb*=colour.a;colour.a=1.0;}
 if(lookupMode>0){vec2 coord=lookupMode==2?vUV2:vSurface.yz;colour*=texture2D(lookupImage,clamp(coord,vec2(0.0),vec2(1.0)));}
 gl_FragColor=texel*colour;if(gl_FragColor.a<alphaCutoff)discard;
 #include <colorspace_fragment>
}`;
