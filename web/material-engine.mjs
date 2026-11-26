import {preserveDetail,fullMaterialPixels,hsv} from './detail-colour.mjs';
import {preparePartFinish,finishPartColour} from './part-finish.mjs';
export const MATERIAL_METHOD='material-zones-v1';
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function materialCache(original,mask,zones){const count=original.length/4,labels=new Uint32Array(count),luminance=new Float32Array(count);for(let p=0;p<count;p++){const value=mask[p*4]+(zones.maskEncoding==='rgb24'?(mask[p*4+1]<<8)+(mask[p*4+2]<<16):0);labels[p]=value===0?0xffffffff:value-1;luminance[p]=(.2126*original[p*4]+.7152*original[p*4+1]+.0722*original[p*4+2])/255}return{method:MATERIAL_METHOD,labels,luminance,zones}}
export function materialPixels(original,targets,cache,options={}){
 const out=fullMaterialPixels(original,options.texture,options.finish,options.colourMode),config=cache.zones,anchors=config.anchors,colors=targets.map(rgb),same=targets.map((v,i)=>v.toLowerCase()===anchors[i].toLowerCase()),exempt=new Set(options.finish?.exemptZones??[]);
 const partFinishes=options.partFinishes??{},prepared={};for(const [index,finish]of Object.entries(partFinishes))prepared[index]=preparePartFinish(finish);
 if(same.every(Boolean)&&!exempt.size&&!Object.values(prepared).some(part=>part.graded))return out;
 const roles=config.roles??[{kind:'metal'},{kind:'cloth'},{kind:'cosmos',highlightIndex:4},{kind:'armor'},{kind:'glow'}];
 const refs=anchors.map((h,i)=>{const c=rgb(h);return Math.max(.015,config.profiles[i]?.reference??(.2126*c[0]+.7152*c[1]+.0722*c[2]))});
 const references=options.colourMode==='preserve'?anchors.map((value,index)=>[hsv(rgb(value)),hsv(colors[index])]):null;
 for(let p=0;p<cache.labels.length;p++){
  const label=cache.labels[p];if(label>=roles.length)continue;
  if(exempt.has(label))out.set(original.subarray(p*4,p*4+4),p*4);
  const role=roles[label],cosmos=role.kind==='cosmos',part=prepared[label],unchanged=same[label]&&(!cosmos||same[role.highlightIndex]);if(unchanged&&(!part||!part.graded))continue;
  const y=cache.luminance[p],profile=config.profiles[label],target=colors[label];let color;
  if(unchanged)color=[out[p*4]/255,out[p*4+1]/255,out[p*4+2]/255];
  else if(options.colourMode==='preserve'&&!cosmos)color=preserveDetail([original[p*4]/255,original[p*4+1]/255,original[p*4+2]/255],null,target,references[label]);
  else if(cosmos){const t=clamp((y-profile.low)/Math.max(.01,profile.high-profile.low))**2;const baseScale=.15+.85*Math.min(1,y/Math.max(.01,profile.mid))**.9;color=target.map((v,k)=>v*baseScale*(1-t)+colors[role.highlightIndex][k]*t)}
  else{const ref=refs[label],shade=(Math.max(0,y)/ref)**.85;if(y<=ref)color=target.map(v=>v*shade);else{const t=clamp((y-ref)/Math.max(.04,profile.high-ref)),highlight=role.highlight??({metal:.5,cloth:.18,leather:.15,skin:.18,glow:.35,hair:.25}[role.kind]??.25);color=target.map(v=>v+(1-v)*highlight*t)}}
  if(part)color=finishPartColour(color,[original[p*4]/255,original[p*4+1]/255,original[p*4+2]/255],[out[p*4]/255,out[p*4+1]/255,out[p*4+2]/255],profile,part);
  for(let k=0;k<3;k++)out[p*4+k]=Math.round(clamp(color[k])*255)
 }
 return out
}
export function harmoniousPalette(zones){
 const hue=Math.random(),accent=(hue+.43+Math.random()*.12)%1;
 function hsl(h,s,l){const a=s*Math.min(l,1-l),f=n=>{const k=(n+h*12)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1))};return '#'+[f(0),f(8),f(4)].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')}
 if(!zones?.roles)return[hsl(accent,.32,.59),hsl(hue,.22,.23),hsl(hue,.5,.105),hsl(hue,.25,.32),hsl(accent,.63,.7)];
 return zones.roles.map((role,i)=>{
  if(role.randomize===false||role.kind==='skin')return zones.anchors[i];
  if(role.kind==='metal')return hsl(accent,.23,.58);
  if(role.kind==='glow')return hsl(accent,.65,.7);
  if(role.kind==='hair')return ['#24242c','#e0ded8','#45372f'][Math.floor(Math.random()*3)];
  if(role.kind==='leather')return hsl((accent+.05)%1,.18,.24);
  if(role.kind==='cloth')return hsl(hue,.24,.2+Math.random()*.1);
  return hsl(hue,.27,.28+Math.random()*.08)
 })
}
