import {hsv,hsvRgb,hexRgb} from './detail-colour.mjs';
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const limits={exposure:[-2,2],saturation:[0,2],contrast:[.5,1.8],shadowAmount:[0,1],highlightAmount:[0,1]};
export const PART_DEFAULTS={exposure:0,saturation:1,contrast:1,shadowColor:'#263858',highlightColor:'#e5edff',shadowAmount:0,highlightAmount:0,range:{mode:'all',color:'#6699dd',tolerance:24}};
export const PART_PRESETS={polished:{label:'Polished contrast',exposure:.08,saturation:.96,contrast:1.18,shadowColor:'#263858',shadowAmount:.1,highlightColor:'#eef2ff',highlightAmount:.15},cool:{label:'Cold shadows',exposure:0,saturation:.94,contrast:1.08,shadowColor:'#263d72',shadowAmount:.35,highlightColor:'#dae7ff',highlightAmount:.08},warm:{label:'Warm reflections',exposure:0,saturation:.95,contrast:1.1,shadowColor:'#20334a',shadowAmount:.1,highlightColor:'#ffe0a5',highlightAmount:.32},muted:{label:'Muted finish',exposure:-.1,saturation:.65,contrast:1.1,shadowAmount:0,highlightAmount:0}};
export function validatePartFinishes(finishes,count){
 if(finishes==null)return;if(typeof finishes!=='object'||Array.isArray(finishes)||Object.keys(finishes).length>count)throw Error('Invalid part finish data.');
 for(const [key,finish]of Object.entries(finishes)){
  if(!/^\d+$/.test(key)||Number(key)>=count||!finish||typeof finish!=='object'||Array.isArray(finish))throw Error('The finish does not belong to these parts.');
  for(const [name,value]of Object.entries(finish)){
   if(name in limits){const [low,high]=limits[name];if(!Number.isFinite(value)||value<low||value>high)throw Error('Invalid part adjustment.');}
   else if(name==='shadowColor'||name==='highlightColor'){if(!/^#[a-f0-9]{6}$/i.test(value))throw Error('Invalid tone colour.');}
   else if(name==='range'){if(!value||!['all','chroma','neutral','sample'].includes(value.mode)||!/^#[a-f0-9]{6}$/i.test(value.color??PART_DEFAULTS.range.color)||!Number.isFinite(value.tolerance??24)||(value.tolerance??24)<2||(value.tolerance??24)>90)throw Error('Invalid colour range.');}
   else throw Error('Unsupported part adjustment.');
  }
 }
}
export function preparePartFinish(value={}){
 const finish={...PART_DEFAULTS,...value,range:{...PART_DEFAULTS.range,...value.range}};
 finish.shadow=hsv(hexRgb(finish.shadowColor));finish.highlight=hsv(hexRgb(finish.highlightColor));finish.sample=hsv(hexRgb(finish.range.color));finish.gain=2**finish.exposure;
 finish.graded=finish.exposure!==0||finish.saturation!==1||finish.contrast!==1||finish.shadowAmount!==0||finish.highlightAmount!==0;
 return finish;
}
export function colourRangeWeight(source,finish){
 const range=finish.range;if(range.mode==='all')return 1;const [h,s,v]=hsv(source);
 if(range.mode==='chroma')return smooth(.15,.45,s);
 if(range.mode==='neutral')return 1-smooth(.08,.28,s);
 const [targetH,targetS,targetV]=finish.sample,width=range.tolerance;
 if(targetS<.15){const band=Math.max(.03,width/90);return(1-smooth(.08,.3,s))*(1-smooth(band*.55,band,Math.abs(v-targetV)))}
 const distance=Math.abs(((h-targetH+.5)%1+1)%1-.5)*360;
 return(1-smooth(width*.6,width,distance))*smooth(.04,Math.max(.12,targetS*.4),s);
}
export function gradePartColour(colour,source,profile,finish){
 if(!finish.graded)return colour;
 let [h,s,v]=hsv(colour);v=finish.gain>1?v*finish.gain/(1+v*(finish.gain-1)):v*finish.gain;
 if(finish.contrast!==1&&v>0&&v<1){const a=v**finish.contrast,b=(1-v)**finish.contrast;v=a/(a+b)}
 s=finish.saturation>1?s*finish.saturation/(1+s*(finish.saturation-1)):s*finish.saturation;
 const y=.2126*source[0]+.7152*source[1]+.0722*source[2],position=clamp((y-(profile?.low??0))/Math.max(.05,(profile?.high??1)-(profile?.low??0)));
 for(const [tint,amount]of [[finish.shadow,finish.shadowAmount*(1-smooth(.08,.58,position))],[finish.highlight,finish.highlightAmount*smooth(.5,.98,position)]]){
  if(!amount)continue;const delta=((tint[0]-h+.5)%1+1)%1-.5;h+=delta*amount;s+=(tint[1]-s)*amount;v*=1-amount+amount*tint[2];
 }
 return hsvRgb(h,clamp(s),clamp(v));
}
export function finishPartColour(colour,source,base,profile,finish){
 if(!finish)return colour;const weight=colourRangeWeight(source,finish);if(!weight)return base;const graded=gradePartColour(colour,source,profile,finish);return graded.map((value,index)=>base[index]+(value-base[index])*weight);
}
export function partMaskPreview(original,labels,selection,finishes){
 const output=new Uint8ClampedArray(original),selected=new Set(selection),prepared={};for(const index of selection)prepared[index]=preparePartFinish(finishes?.[index]);
 for(let p=0;p<labels.length;p++){const index=labels[p],offset=p*4;let level=0;if(selected.has(index))level=colourRangeWeight([original[offset]/255,original[offset+1]/255,original[offset+2]/255],prepared[index]);for(let c=0;c<3;c++)output[offset+c]=Math.round(original[offset+c]*.12*(1-level)+255*level)}
 return output;
}
