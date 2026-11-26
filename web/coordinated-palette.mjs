const rgb=value=>[1,3,5].map(index=>parseInt(value.slice(index,index+2),16)/255);
const hex=values=>'#'+values.map(value=>Math.round(Math.max(0,Math.min(1,value))*255).toString(16).padStart(2,'0')).join('');
function hsl(color){const c=rgb(color),max=Math.max(...c),min=Math.min(...c),delta=max-min,l=(max+min)/2;if(delta<1e-6)return[0,0,l];let h=max===c[0]?((c[1]-c[2])/delta)%6:max===c[1]?(c[2]-c[0])/delta+2:(c[0]-c[1])/delta+4;return[(h/6+1)%1,delta/(1-Math.abs(2*l-1)),l]}
function fromHsl([h,s,l]){const a=s*Math.min(l,1-l),f=n=>{const k=(n+h*12)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1))};return hex([f(0),f(8),f(4)])}
export function paletteScheme(primary,style='custom',secondary='#a5a9b2',accent='#e7b978'){
 const [h,s,l]=hsl(primary);
 if(style==='complementary')return[primary,fromHsl([(h+.5)%1,s*.6,Math.max(.2,l*.85)]),fromHsl([(h+.5)%1,Math.min(1,s+.15),.68])];
 if(style==='analogous')return[primary,fromHsl([(h+.08)%1,s*.75,Math.max(.2,l*.8)]),fromHsl([(h+.92)%1,Math.min(1,s+.1),.65])];
 if(style==='monochrome')return[primary,fromHsl([h,s*.35,.23]),fromHsl([h,s*.45,.75])];
 return[primary,secondary,accent];
}
export function coordinatedPalette(zones,colors,weights=[]){
 if(colors.length!==3||!colors.every(value=>/^#[0-9a-f]{6}$/i.test(value)))throw Error('Choose three valid palette colours.');
 const source=zones.anchors.map(rgb),features=source.map(c=>{const max=Math.max(...c),min=Math.min(...c),length=Math.hypot(...c)||1;return[c[0]/length,c[1]/length,c[2]/length,(max-min)*.5]});
 const centers=[features[weights.length?weights.indexOf(Math.max(...weights)):0].slice()];
 while(centers.length<3){let best=-1,index=0;features.forEach((f,i)=>{const distance=Math.min(...centers.map(c=>f.reduce((sum,value,k)=>sum+(value-c[k])**2,0)));if(distance>best){best=distance;index=i}});centers.push(features[index].slice())}
 const labels=new Uint8Array(source.length);
 for(let round=0;round<8;round++){const sums=centers.map(()=>[0,0,0,0,0]);features.forEach((f,i)=>{let label=0,best=Infinity;centers.forEach((c,k)=>{const d=f.reduce((sum,value,j)=>sum+(value-c[j])**2,0);if(d<best){best=d;label=k}});labels[i]=label;const weight=Math.max(1,weights[i]??1);f.forEach((value,k)=>sums[label][k]+=value*weight);sums[label][4]+=weight});sums.forEach((sum,i)=>{if(sum[4])centers[i]=sum.slice(0,4).map(value=>value/sum[4])})}
 const totals=[0,0,0];labels.forEach((label,i)=>totals[label]+=weights[i]??1);const order=[0,1,2].sort((a,b)=>totals[b]-totals[a]),palette=colors.map(rgb);
 return zones.anchors.map((anchor,i)=>{const kind=zones.roles?.[i]?.kind;if(zones.roles?.[i]?.randomize===false||kind==='skin')return anchor;const slot=kind==='glow'?2:kind==='metal'?1:order.indexOf(labels[i]);const target=palette[Math.max(0,slot)],brightness=.2126*source[i][0]+.7152*source[i][1]+.0722*source[i][2],reference=source.reduce((sum,c,j)=>sum+(labels[j]===labels[i]?(.2126*c[0]+.7152*c[1]+.0722*c[2]):0),0)/Math.max(1,[...labels].filter(label=>label===labels[i]).length),shade=Math.max(.35,Math.min(1.3,brightness/Math.max(.03,reference)));return hex(target.map(value=>value*shade))});
}
