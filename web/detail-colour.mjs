const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
export function hsv(rgb){const value=Math.max(...rgb),minimum=Math.min(...rgb),delta=value-minimum;let hue=0;if(delta)hue=value===rgb[0]?((rgb[1]-rgb[2])/delta)%6:value===rgb[1]?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4;return[((hue/6)%1+1)%1,value?delta/value:0,value]}
export function hsvRgb(h,s,v){h=((h%1)+1)%1;const sector=Math.floor(h*6),f=h*6-sector,p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f));return[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][sector]}
export const hexRgb=value=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255);
const smooth=(low,high,value)=>{const t=clamp((value-low)/(high-low));return t*t*(3-2*t)};
const lift=(value,gain)=>gain>1?value*gain/(1+value*(gain-1)):value*gain;
export function preserveDetail(rgb,anchor,target,prepared=null){
 const [h,s,v]=hsv(rgb),[ah,as,av]=prepared?.[0]??hsv(anchor),[th,ts,tv]=prepared?.[1]??hsv(target),sat=as>.04?lift(s,ts/as):s+ts*(1-smooth(.75,1.5,v/Math.max(.02,av))),value=lift(v,Math.max(.025,tv)/Math.max(.025,av));
 const difference=((h-ah+.5)%1+1)%1-.5,reliability=smooth(.2,.45,as)*smooth(.1,.35,s),hue=th+clamp(difference,-.08,.08)*reliability;
 return hsvRgb(hue,clamp(sat),clamp(value));
}
export const FINISH_PRESETS={
 cobalt:{normalColor:'#0055ff',normalHue:.611,rColor:'#00d7ff',rHue:.526,metalColor:'#668bff',metalHue:.605,metalSaturation:.12,metalGain:1.04,normalGain:1.055,saturation:.94,effects:true},
 glacier:{normalColor:'#00b6ff',normalHue:.548,rColor:'#2000ff',rHue:.646,metalColor:'#66c3ff',metalHue:.565,metalSaturation:.075,metalGain:1.31,normalGain:1.055,saturation:.77,effects:true}
};
export function validateFinish(finish,profile){
 if(finish==null)return;
 if(!profile||finish.profile!==profile.id)throw Error('This finish does not belong to the selected skin.');
 for(const key of ['normalColor','rColor','metalColor'])if(finish[key]!=null&&!/^#[0-9a-f]{6}$/i.test(finish[key]))throw Error('Invalid finish colour.');
 for(const [key,low,high]of [['normalHue',0,1],['rHue',0,1],['metalHue',0,1],['saturation',0,1.5],['metalSaturation',0,1],['metalGain',.2,2],['normalGain',.2,2]])if(finish[key]!=null&&(!Number.isFinite(finish[key])||finish[key]<low||finish[key]>high))throw Error('Invalid finish adjustment.');
 if(finish.exemptZones&&!Array.isArray(finish.exemptZones))throw Error('Invalid finish selection.');
 if(finish.channels!=null){if(typeof finish.channels!=='object'||Array.isArray(finish.channels))throw Error('Invalid material colours.');const channels=new Map((profile.channels??[]).map(channel=>[channel.id,channel]));for(const [id,value]of Object.entries(finish.channels)){const channel=channels.get(id);if(!channel||!/^#[a-f0-9]{6}$/i.test(value))throw Error('Unknown material colour.');if(channel.editable===false&&value.toLowerCase()!==channel.anchor.toLowerCase())throw Error('The global palette must preserve skin tones.')}}
}
export function semanticLabels(pixels,encoding,count){const labels=new Uint32Array(pixels.length/4);for(let p=0;p<labels.length;p++){const value=pixels[p*4]+(encoding==='rgb24'?(pixels[p*4+1]<<8)+(pixels[p*4+2]<<16):0);if(value>count)throw Error('Unknown material in the colour map.');labels[p]=value?value-1:0xffffffff}return labels}
const semanticCache=new WeakMap();
function semanticMaterialPixels(original,texture,finish,mode){
 const semantic=texture.semantic;if(!semantic.labels||semantic.labels.length!==original.length/4)throw Error('The material colour map has not loaded.');
 const key=JSON.stringify([semantic.mask,finish.channels,finish.saturation,finish.metalGain,mode]),cached=semanticCache.get(original);if(cached?.key===key)return new Uint8ClampedArray(cached.pixels);
 const output=new Uint8ClampedArray(original),targets=semantic.channelIds.map((id,i)=>finish.channels?.[id]??semantic.anchors[i]),colours=targets.map(hexRgb),sources=semantic.anchors.map(hexRgb),references=sources.map((value,i)=>[hsv(value),hsv(colours[i])]);
 for(let p=0;p<semantic.labels.length;p++){
  const label=semantic.labels[p];if(label>=targets.length)continue;const role=semantic.roles[label];if(role.kind==='skin')continue;const source=[original[p*4]/255,original[p*4+1]/255,original[p*4+2]/255],same=targets[label].toLowerCase()===semantic.anchors[label].toLowerCase(),cosmos=role.kind==='cosmos',highlightChanged=cosmos&&targets[role.highlightIndex]!==semantic.anchors[role.highlightIndex];let rgb=source;
  if(!same||highlightChanged){
   const y=.2126*source[0]+.7152*source[1]+.0722*source[2],profile=semantic.profiles[label],target=colours[label];
   if(cosmos){const t=clamp((y-profile.low)/Math.max(.01,profile.high-profile.low))**2,scale=.15+.85*Math.min(1,y/Math.max(.01,profile.mid))**.9,highlight=colours[role.highlightIndex];rgb=target.map((v,i)=>v*scale*(1-t)+highlight[i]*t)}
   else if(mode==='preserve')rgb=preserveDetail(source,null,target,references[label]);
   else{const ref=Math.max(.015,profile.reference??(.2126*sources[label][0]+.7152*sources[label][1]+.0722*sources[label][2])),shade=(y/ref)**.85;if(y<=ref)rgb=target.map(v=>v*shade);else{const amount=clamp((y-ref)/Math.max(.04,profile.high-ref)),highlight=role.highlight??({metal:.5,cloth:.18,leather:.15,skin:.18,glow:.35,hair:.25}[role.kind]??.25);rgb=target.map(v=>v+(1-v)*highlight*amount)}}
  }
  if((finish.saturation??1)!==1){const [h,s,v]=hsv(rgb);rgb=hsvRgb(h,clamp(s*finish.saturation),v)}
  if(role.kind==='metal'&&(finish.metalGain??1)!==1){const max=Math.max(...rgb),gain=finish.metalGain,value=gain>1?max*gain/(1+max*(gain-1)):max*gain;rgb=rgb.map(v=>max?v*value/max:0)}
  for(let c=0;c<3;c++)output[p*4+c]=Math.round(clamp(rgb[c])*255);
 }
 semanticCache.set(original,{key,pixels:new Uint8ClampedArray(output)});return output;
}
function finishHue(finish,state){const colour=finish[state==='r'?'rColor':'normalColor'];return colour?(finish[state==='r'?'rHue':'normalHue']??hsv(hexRgb(colour))[0]):null}
export function finishVector(rgb,state,finish){
 const value=Math.max(...rgb),minimum=Math.min(...rgb),hue=finishHue(finish,state);if(value<=0||value-minimum<value*.065)return rgb.slice();
 if(hue==null)return (finish.saturation??1)===1?rgb.slice():hsvRgb(hsv(rgb)[0],Math.min(1,(value-minimum)/value*finish.saturation),value);
 return hsvRgb(hue,Math.min(1,(value-minimum)/value*(finish.saturation??1)),value*Math.max(...hexRgb(finish[state==='r'?'rColor':'normalColor'])));
}
const fullCache=new WeakMap();
export function fullMaterialPixels(original,texture,finish,mode='preserve'){
 if(!finish||!texture||texture.kind==='fx'&&finish.effects===false)return new Uint8ClampedArray(original);
 if(texture.semantic)return semanticMaterialPixels(original,texture,finish,mode);
 const normal=texture.weaponSplit||texture.state==='normal',ultimate=texture.weaponSplit||texture.state==='r',key=JSON.stringify([texture,normal?[finish.normalColor,finish.normalHue,texture.kind==='model'?finish.normalGain:null]:null,ultimate?[finish.rColor,finish.rHue]:null,finish.saturation,texture.bodyMetal?[finish.metalColor,finish.metalHue,finish.metalSaturation,finish.metalGain]:null]),cached=fullCache.get(original);if(cached?.key===key)return new Uint8ClampedArray(cached.pixels);
 const output=new Uint8ClampedArray(original),palette={};
 for(const state of ['normal','r']){const h=finishHue(finish,state);palette[state]=h==null?null:{unit:hsvRgb(h,1,1),gain:Math.max(...hexRgb(finish[state==='r'?'rColor':'normalColor']))*(texture.kind==='model'&&(texture.weaponSplit||state==='normal')?(finish.normalGain??1):1)}}
 const metalEnabled=texture.bodyMetal&&(finish.metalColor||(finish.metalGain??1)!==1),metal=metalEnabled&&finish.metalColor?hsvRgb(finish.metalHue??hsv(hexRgb(finish.metalColor))[0],finish.metalSaturation??.1,1):null,saturation=finish.saturation??1;
 for(let p=0;p<original.length;p+=4){
  const r=original[p]/255,g=original[p+1]/255,b=original[p+2]/255,v=Math.max(r,g,b),delta=v-Math.min(r,g,b),s=v?delta/v:0;let state=texture.state;
  if(texture.weaponSplit){let h=0;if(delta)h=v===r?((g-b)/delta)%6:v===g?(b-r)/delta+2:(r-g)/delta+4;h=((h/6)%1+1)%1;state=h>.36&&h<.80?'r':'normal'}
  const target=palette[state];let rr=r,gg=g,bb=b;
  if(target){const amount=smooth(.045,.18,s)*smooth(.005,.035,delta),value=Math.min(1,v*target.gain),sat=clamp(s*saturation),low=value*(1-sat),chroma=value*sat;rr+=(low+chroma*target.unit[0]-r)*amount;gg+=(low+chroma*target.unit[1]-g)*amount;bb+=(low+chroma*target.unit[2]-b)*amount}
  else if(saturation!==1&&s){const amount=smooth(.045,.18,s)*smooth(.005,.035,delta),scale=clamp(s*saturation)/s;rr+=(v-(v-r)*scale-r)*amount;gg+=(v-(v-g)*scale-g)*amount;bb+=(v-(v-b)*scale-b)*amount}
  if(metalEnabled){const amount=(1-smooth(.16,.36,s))*smooth(.10,.25,v)*(1-smooth(.69,.88,v)),value=Math.min(1,v*(finish.metalGain??1)),mr=metal?metal[0]*value:r*value/Math.max(.00001,v),mg=metal?metal[1]*value:g*value/Math.max(.00001,v),mb=metal?metal[2]*value:b*value/Math.max(.00001,v);rr+=(mr-rr)*amount;gg+=(mg-gg)*amount;bb+=(mb-bb)*amount}
  output[p]=Math.floor(clamp(rr)*255+.5);output[p+1]=Math.floor(clamp(gg)*255+.5);output[p+2]=Math.floor(clamp(bb)*255+.5);
 }
 fullCache.set(original,{key,pixels:new Uint8ClampedArray(output)});return output;
}
