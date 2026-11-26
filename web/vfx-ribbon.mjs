const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),length=a=>Math.hypot(...a),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function ribbonVertices(points,{camera,arbitrary=false,mode=1,smoothing=0,cutoff=0}={}){
 if(points.length<2)return[];let ordered=smoothing===2?points.slice():points.slice().reverse();
 if(smoothing)ordered=ordered.map((point,index)=>{if(!index||index===ordered.length-1)return point;return{...point,position:mul(add(add(ordered[index-1].position,point.position),ordered[index+1].position),1/3)}});
 const vertices=[];let travelled=0;const sideAt=(a,b,point)=>{const direction=sub(b,a);let side=cross(direction,arbitrary?[0,0,1]:sub(camera,point));if(length(side)<1e-8)side=cross(direction,[1,0,0]);return length(side)>1e-8?mul(side,1/length(side)):[0,1,0]};
 for(let i=0;i<ordered.length-1;i++){
  const a=ordered[i],original=ordered[i+1];let b=original;const run=length(sub(b.position,a.position));if(run<1e-6)continue;if(cutoff>0&&travelled>=cutoff)break;
  if(cutoff>0&&travelled+run>cutoff){const t=(cutoff-travelled)/run;b={...b,position:add(a.position,mul(sub(b.position,a.position),t)),bornDistance:a.bornDistance+(b.bornDistance-a.bornDistance)*t,width:a.width+(b.width-a.width)*t}}
  const distance=length(sub(b.position,a.position)),side=sideAt(a.position,b.position,a.position),left=mul(side,Math.max(.001,Math.abs(a.width))),right=mul(side,Math.max(.001,Math.abs(b.width))),tileA=a.tiling?.[0]??0,tileB=b.tiling?.[0]??0,u0=tileA>0?(mode?a.bornDistance:travelled)/tileA:0,u1=tileB>0?(mode?b.bornDistance:travelled+distance)/tileB:0;
  const vRange=point=>{const tile=point.tiling?.[1]??0,half=tile>0?Math.abs(point.width)/tile:tile<0?-tile:.5;return[.5-half,.5+half]},va=vRange(a),vb=vRange(b),a0={point:a,position:sub(a.position,left),uv:[u0,va[0]]},a1={point:a,position:add(a.position,left),uv:[u0,va[1]]},b0={point:b,position:sub(b.position,right),uv:[u1,vb[0]]},b1={point:b,position:add(b.position,right),uv:[u1,vb[1]]};vertices.push(a0,a1,b1,a0,b1,b0);travelled+=distance;
 }
 return vertices;
}
