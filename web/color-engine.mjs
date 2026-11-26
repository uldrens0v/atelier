export const METHOD='perceptual-v2';
export function fromHex(h){return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255)}
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const srgb=v=>v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055;
export function toLab(c){const r=linear(c[0]),g=linear(c[1]),b=linear(c[2]),l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s]}
export function fromLab(c){const l=(c[0]+.3963377774*c[1]+.2158037573*c[2])**3,m=(c[0]-.1055613458*c[1]-.0638541728*c[2])**3,s=(c[0]-.0894841775*c[1]-1.291485548*c[2])**3;return [srgb(4.0767416621*l-3.3077115913*m+.2309699292*s),srgb(-1.2684380046*l+2.6097574011*m-.3413193965*s),srgb(-.0041960863*l-.7034186147*m+1.707614701*s)]}
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
export function toHex(c){return '#'+c.map(v=>Math.round(clip(v,0,1)*255).toString(16).padStart(2,'0')).join('')}
export function preparePalette(anchors,targets){const source=anchors.map(h=>toLab(fromHex(h))),target=targets.map(h=>toLab(fromHex(h))),delta=source.map((a,i)=>[clip(target[i][0]-a[0],-.2,.2),target[i][1]-a[1],target[i][2]-a[2]]);return {source,delta,identity:anchors.every((a,i)=>a.toLowerCase()===targets[i].toLowerCase())}}
export function makeCache(pixels,anchors){const source=anchors.map(h=>toLab(fromHex(h))),count=pixels.length/4,labs=new Float32Array(count*3),weights=new Float32Array(count*anchors.length),labels=new Uint8Array(count);for(let p=0;p<count;p++){const lab=toLab([pixels[p*4]/255,pixels[p*4+1]/255,pixels[p*4+2]/255]);labs.set(lab,p*3);const distances=source.map(a=>(lab[0]-a[0])**2+.85*(lab[1]-a[1])**2+.85*(lab[2]-a[2])**2);const minimum=Math.min(...distances);labels[p]=distances.indexOf(minimum);let sum=0;for(let i=0;i<source.length;i++){const w=Math.exp(-(distances[i]-minimum)/.0128);weights[p*source.length+i]=w;sum+=w}for(let i=0;i<source.length;i++)weights[p*source.length+i]/=sum}return{labs,weights,labels}}
export function recolorPixels(original,anchors,targets,cache){const output=new Uint8ClampedArray(original),palette=preparePalette(anchors,targets);if(palette.identity)return output;cache??=makeCache(original,anchors);const count=original.length/4,n=anchors.length;for(let p=0;p<count;p++){const base=p*3;let l=0,a=0,b=0;for(let i=0;i<n;i++){const w=cache.weights[p*n+i],d=palette.delta[i];l+=d[0]*w;a+=d[1]*w;b+=d[2]*w}const sourceL=cache.labs[base],room=4*sourceL*(1-sourceL),lab=[clip(sourceL+l*room,.005,.995),cache.labs[base+1]+a,cache.labs[base+2]+b],color=fromLab(lab);for(let k=0;k<3;k++)output[p*4+k]=Math.round(clip(color[k],0,1)*255)}return output}
export function presetTargets(anchors,skin){const base=toLab(fromHex(skin.palette[0])),accent=toLab(fromHex(skin.palette[1])),energy=toLab(fromHex(skin.palette[2]));return anchors.map(h=>{const c=fromHex(h),lab=toLab(c),max=Math.max(...c),min=Math.min(...c),saturation=max?1-min/max:0;let target;
if(skin.id==='yasuo-2'){
if(saturation<.24){target=[clip(lab[0]+.13,.08,.94),base[1],base[2]]}
else if(c[0]>c[1]*1.7&&saturation>.73){target=[clip(lab[0]+.03,.1,.84),energy[1],energy[2]]}
else return h;
}else{
const warm=c[0]>c[2]*1.25&&c[0]>c[1]*1.13;
if(warm&&saturation<.7&&skin.champion==='Yasuo')return h;
if(saturation<.23){const shift=clip(base[0]-.52,-.12,.14);target=[clip(lab[0]+shift,.06,.94),base[1]*.65,base[2]*.65]}
else if(warm){target=[clip(lab[0],.12,.9),accent[1],accent[2]]}
else{target=[clip(lab[0],.12,.9),energy[1],energy[2]]}
}
return toHex(fromLab(target))})}
