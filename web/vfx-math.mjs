import {travelDistance,flightDuration} from './vfx-motion.mjs';
export const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
export function random(seed,channel=0){let value=(seed^Math.imul(channel+1,0x9e3779b9))>>>0;value=Math.imul(value^(value>>>16),0x21f0aaad);value=Math.imul(value^(value>>>15),0x735a2d97);return((value^(value>>>15))>>>0)/4294967296}
export function interpolate(times,values,time,fallback){
 if(!values?.length)return Array.isArray(fallback)?fallback.slice():fallback;if(!times?.length||values.length===1||time<=times[0])return Array.isArray(values[0])?values[0].slice():values[0];const end=Math.min(times.length,values.length)-1;if(time>=times[end])return Array.isArray(values[end])?values[end].slice():values[end];
 let i=0;while(i<end-1&&time>times[i+1])i++;const t=clamp((time-times[i])/Math.max(.000001,times[i+1]-times[i]));return Array.isArray(values[i])?values[i].map((value,k)=>value+(values[i+1][k]-value)*t):values[i]+(values[i+1]-values[i])*t;
}
export function sampleValue(value,time,seed=1,fallback=0,sharedProbability=false){
 if(value==null)return Array.isArray(fallback)?fallback.slice():fallback;if(typeof value==='number'||Array.isArray(value))return Array.isArray(value)?value.slice():value;
 const constant=value.constantValue??fallback,dynamics=value.dynamics;let result=interpolate(dynamics?.times,dynamics?.values,time,constant);
 if(dynamics?.values?.length&&dynamics._type&&!dynamics._type.includes('VariableData'))result=Array.isArray(result)?result.map((v,i)=>v*(Array.isArray(constant)?constant[i]:constant)):result*constant;
 for(let i=0;i<(Array.isArray(result)?result.length:1);i++){const table=dynamics?.probabilityTables?.[i];if(!table?.keyValues?.length)continue;const multiplier=interpolate(table.keyTimes,table.keyValues,random(seed,sharedProbability?20:i),1);if(Array.isArray(result))result[i]*=multiplier;else result*=multiplier}
 return result;
}
export function integrateValue(value,phase,life,seed=1,fallback=0){
 const dynamics=value?.dynamics;if(!dynamics?.times||dynamics.times.length<2)return multiply(sampleValue(value,phase,seed,fallback),life);
 const count=Math.max(1,Math.ceil(clamp(phase)*96));let result=Array.isArray(fallback)?fallback.map(()=>0):0;
 for(let i=0;i<count;i++){const t0=phase*i/count,t1=phase*(i+1)/count,a=sampleValue(value,t0,seed,fallback),b=sampleValue(value,t1,seed,fallback);result=add(result,multiply(add(a,b),(t1-t0)*life*.5))}return result;
}
export function multiply(value,factor){return Array.isArray(value)?value.map(v=>v*factor):value*factor}
export function add(a,b){return Array.isArray(a)?a.map((v,i)=>v+b[i]):a+b}
export function emitterPhaseAt(emitter,time){const spans=[emitter.lifetime,emitter.timeActiveDuringPeriod,emitter.period].filter(value=>Number.isFinite(value)&&value>0);return spans.length?(time-(emitter.timeBeforeFirstEmission??0))/Math.min(...spans):0}
export function phaseOrigin(phase,time,ability,distance=ability.range){if(phase==='cast')return[0,0,120];return[0,phase==='impact'?distance:travelDistance(time-ability.castTime,ability,distance),120]}
export function phaseStart(phase,ability,distance=ability.range){return phase==='cast'?0:phase==='flight'?ability.castTime:ability.castTime+flightDuration(ability,distance)}
export function emissionTimes(emitter,window){
 const delay=Math.max(0,emitter.timeBeforeFirstEmission??0),end=Math.min(window,emitter.lifetime>0?emitter.lifetime:window);if(delay>end||emitter.disabled)return[];
 if(emitter.isSingleParticle){const count=Math.min(256,Math.max(1,Math.round(sampleValue(emitter.rate,0,1,1))));return Array(count).fill(delay)}
 const result=[];let accumulated=0;for(let t=delay;t<=end;t+=1/120){accumulated+=Math.max(0,sampleValue(emitter.rate,emitterPhaseAt(emitter,t),1,0))/120;while(accumulated>=1){result.push(t);accumulated--;if(result.length>=512)return result}}return result;
}
export function spawnOffset(emitter,phase,seed){
 const shape=emitter.SpawnShape??{},offset=add(sampleValue(shape.emitOffset,phase,seed,[0,0,0]),sampleValue(emitter.EmitterPosition,phase,seed,[0,0,0]));
 if(shape._type==='VfxShapeBox')for(let i=0;i<3;i++)offset[i]+=(random(seed,i+8)*2-1)*(shape.Size?.[i]??0);
 if(shape._type==='VfxShapeCylinder'){const angle=random(seed,9)*Math.PI*2,radius=Math.sqrt(random(seed,10))*(shape.radius??0);offset[0]+=Math.cos(angle)*radius;offset[2]+=Math.sin(angle)*radius}
 return offset;
}
export function particleRgba(emitter,spawn,localTime,seed){
 const emitterPhase=emitterPhaseAt(emitter,spawn),life=sampleValue(emitter.particleLifetime,emitterPhase,seed,1)<0?Infinity:Math.max(.001,sampleValue(emitter.particleLifetime,emitterPhase,seed,1)),age=localTime-spawn,normalized=sampleValue(emitter.particleLifetime,emitterPhase,seed,1)<0?0:clamp(age/life);
 const birthColour=sampleValue(emitter.birthColor,emitterPhase,seed,[1,1,1,1]),colour=sampleValue(emitter.Color,normalized,seed,[1,1,1,1]),constant=emitter.constantColor??[1,1,1,1],modulation=emitter.modulationFactor??[1,1,1,1],rgba=birthColour.map((v,i)=>v*colour[i]*constant[i]*modulation[i]);if(age>life){const linger=emitter.Linger;if(linger?.UseSeparateLingerColor){const value=sampleValue(linger.SeparateLingerColor,clamp((age-life)/Math.max(.001,emitter.particleLinger)),seed,[1,1,1,1]);for(let i=0;i<4;i++)rgba[i]=value[i]}else rgba[3]=0}
 return rgba;
}
export function particleSample(emitter,spawn,localTime,seed,ability,phase,distance=ability.range){
 const emitterPhase=emitterPhaseAt(emitter,spawn),nativeLife=sampleValue(emitter.particleLifetime,emitterPhase,seed,1),life=nativeLife<0?(phase==='flight'?flightDuration(ability,distance):Math.max(1,emitter.lifetime??1)):Math.max(.001,nativeLife),age=localTime-spawn;if(age<0||age>life+Math.max(0,emitter.particleLinger??0))return null;const normalized=nativeLife<0?0:clamp(age/life),position=spawnOffset(emitter,emitterPhase,seed),velocity=sampleValue(emitter.birthVelocity,emitterPhase,seed,[0,0,0]),birthAcceleration=sampleValue(emitter.birthAcceleration,emitterPhase,seed,[0,0,0]),birthDrag=sampleValue(emitter.birthDrag,emitterPhase,seed,[0,0,0]),steps=Math.max(1,Math.ceil(Math.min(age,life)*60)),dt=Math.min(age,life)/steps;
 for(let step=0;step<steps;step++){const t=(step+.5)*dt/life,acceleration=add(add(birthAcceleration,sampleValue(emitter.acceleration,t,seed,[0,0,0])),sampleValue(emitter.worldAcceleration,t,seed,[0,0,0])),drag=add(birthDrag,sampleValue(emitter.drag,t,seed,[0,0,0]));for(let k=0;k<3;k++){velocity[k]=(velocity[k]+acceleration[k]*dt)*Math.max(0,1-drag[k]*dt);position[k]+=(velocity[k]+sampleValue(emitter.velocity,t,seed,[0,0,0])[k])*dt}}
 const start=phaseStart(phase,ability,distance),origin=phaseOrigin(phase,start+spawn,ability,distance),now=phaseOrigin(phase,start+Math.min(localTime,flightDuration(ability,distance)),ability,distance),bind=clamp(sampleValue(emitter.bindWeight,emitterPhase,seed,0));for(let k=0;k<3;k++)position[k]+=origin[k]+(now[k]-origin[k])*bind;
 const birthScale=sampleValue(emitter.birthScale0,emitterPhase,seed,[1,1,1]),scale=sampleValue(emitter.scale0,normalized,seed,[1,1,1]),size=birthScale.map((v,i)=>v*scale[i]);if(emitter.isUniformScale)size.fill(size[0]);
 const rotation=sampleValue(emitter.birthRotation0,emitterPhase,seed,[0,0,0]),spin=sampleValue(emitter.birthRotationalVelocity0,emitterPhase,seed,[0,0,0]),animated=integrateValue(emitter.rotation0,normalized,life,seed,[0,0,0]);for(let k=0;k<3;k++)rotation[k]+=spin[k]*age+animated[k];
 const rgba=particleRgba(emitter,spawn,localTime,seed);
 const frameRate=(emitter.frameRate??0)*sampleValue(emitter.birthFrameRate,emitterPhase,seed,1),frames=Math.max(1,emitter.numFrames??1),frame=(Math.floor((emitter.startFrame??0)+(emitter.isRandomStartFrame?random(seed,20)*frames:0)+age*frameRate)%frames+frames)%frames,uvOffset=add(sampleValue(emitter.birthUVOffset,emitterPhase,seed,[0,0]),multiply(sampleValue(emitter.birthUvScrollRate,emitterPhase,seed,[0,0]),age));
 const scrolling=integrateValue(emitter.particleUVScrollRate,normalized,life,seed,[0,0]);for(let i=0;i<2;i++)uvOffset[i]+=scrolling[i];
 return{position,size,rotation,velocity,rgba,frame,uvOffset,uvRotation:sampleValue(emitter.uvRotation,normalized,seed,0)+age*sampleValue(emitter.birthUvRotateRate,emitterPhase,seed,0),uvScale:sampleValue(emitter.uvScale,normalized,seed,[1,1]),age,life,normalized};
}
