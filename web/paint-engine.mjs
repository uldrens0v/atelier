const clamp=value=>Math.max(0,Math.min(1,value));
const pack=(r,g,b,a)=>(r|(g<<8)|(b<<16)|(a<<24))>>>0;
export function encodeBytes(bytes){let value='';for(let offset=0;offset<bytes.length;offset+=16384)value+=String.fromCharCode(...bytes.subarray(offset,offset+16384));return btoa(value)}
export function decodeBytes(text){return Uint8Array.from(atob(text),value=>value.charCodeAt(0))}

export class PaintLayer{
 constructor(width,height){this.width=width;this.height=height;this.values=new Map();this.revision=0}
 set(index,value){if(value)this.values.set(index,value>>>0);else this.values.delete(index);this.revision++}
 applyChange(indices,values){for(let i=0;i<indices.length;i++)this.set(indices[i],values[i])}
 payload(){const indices=Uint32Array.from([...this.values.keys()].sort((a,b)=>a-b)),colors=Uint32Array.from(indices,index=>this.values.get(index));return{width:this.width,height:this.height,indices:encodeBytes(new Uint8Array(indices.buffer)),rgba:encodeBytes(new Uint8Array(colors.buffer))}}
}

export function paintEntries(payload,width,height){
 if(payload instanceof PaintLayer){if(payload.width!==width||payload.height!==height)throw Error('Paint dimensions do not match the texture.');return payload.values.entries()}
 if(!payload)return[];const maximum=Math.ceil(width*height*4/3)*4;if(payload.width!==width||payload.height!==height||typeof payload.indices!=='string'||typeof payload.rgba!=='string'||payload.indices.length>maximum||payload.rgba.length>maximum)throw Error('Invalid paint layer.');
 const rawIndices=decodeBytes(payload.indices),rawColors=decodeBytes(payload.rgba);if(rawIndices.length%4||rawColors.length!==rawIndices.length)throw Error('Incomplete paint data.');const indices=new Uint32Array(rawIndices.buffer),colors=new Uint32Array(rawColors.buffer);let previous=-1;for(const index of indices){if(index<=previous||index>=width*height)throw Error('Invalid paint pixel.');previous=index}return(function*(){for(let i=0;i<indices.length;i++)yield[indices[i],colors[i]]})();
}

export function composePaint(pixels,paint,width,height){
 const out=new Uint8ClampedArray(pixels);for(const [index,color] of paintEntries(paint,width,height)){const alpha=(color>>>24)/255;if(!alpha)continue;for(let k=0;k<3;k++)out[index*4+k]=Math.round(out[index*4+k]*(1-alpha)+((color>>>(k*8))&255)*alpha)}return out;
}

export function paintTriangle(layer,original,{uv,space,color,opacity=1,hardness=.7,reference=.5,erase=false,columns=1,rows=1},before){
 const a=space.slice(0,3),ab=space.slice(3,6).map((v,k)=>v-a[k]),ac=space.slice(6,9).map((v,k)=>v-a[k]),dot=(x,y)=>x.reduce((sum,value,k)=>sum+value*y[k],0),g11=dot(ab,ab),g12=dot(ab,ac),g22=dot(ac,ac),det=g11*g22-g12*g12;if(det<1e-16)return 0;
 const planeNormal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],distance=dot(a,planeNormal)/Math.sqrt(dot(planeNormal,planeNormal));if(Math.abs(distance)>1)return 0;
 const du=[uv[2]-uv[0],uv[4]-uv[0]],dv=[uv[3]-uv[1],uv[5]-uv[1]],gradient=values=>ab.map((v,k)=>(v*(values[0]*g22-values[1]*g12)+ac[k]*(values[1]*g11-values[0]*g12))/det),gu=gradient(du),gv=gradient(dv),uc=uv[0]-dot(gu,a),vc=uv[1]-dot(gv,a),span=Math.sqrt(Math.max(0,1-distance*distance)),ru=Math.sqrt(dot(gu,gu))*span,rv=Math.sqrt(dot(gv,gv))*span,uvDet=du[0]*dv[1]-du[1]*dv[0];if(Math.abs(uvDet)<1e-14)return 0;
 const rgb=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16)),tileWidth=layer.width/columns,tileHeight=layer.height/rows;let changed=0;
 for(let shiftU=Math.floor(Math.min(uv[0],uv[2],uv[4]));shiftU<=Math.floor(Math.max(uv[0],uv[2],uv[4]));shiftU++)for(let shiftV=Math.floor(Math.min(uv[1],uv[3],uv[5]));shiftV<=Math.floor(Math.max(uv[1],uv[3],uv[5]));shiftV++){
  const x0=Math.max(0,Math.floor((Math.max(Math.min(uv[0],uv[2],uv[4]),uc-ru)-shiftU)*tileWidth)),x1=Math.min(tileWidth-1,Math.ceil((Math.min(Math.max(uv[0],uv[2],uv[4]),uc+ru)-shiftU)*tileWidth)),y0=Math.max(0,Math.floor((Math.max(Math.min(uv[1],uv[3],uv[5]),vc-rv)-shiftV)*tileHeight)),y1=Math.min(tileHeight-1,Math.ceil((Math.min(Math.max(uv[1],uv[3],uv[5]),vc+rv)-shiftV)*tileHeight));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const u=(x+.5)/tileWidth+shiftU-uv[0],v=(y+.5)/tileHeight+shiftV-uv[1],b=(u*dv[1]-du[1]*v)/uvDet,c=(du[0]*v-u*dv[0])/uvDet;if(b<-.00001||c<-.00001||b+c>1.00001)continue;
   const point=a.map((value,k)=>value+ab[k]*b+ac[k]*c),r=Math.sqrt(dot(point,point));if(r>1)continue;const fade=r<=hardness?1:clamp((1-r)/Math.max(.001,1-hardness)),alpha=clamp(opacity)*fade*fade*(3-2*fade);if(alpha<.002)continue;
   for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const index=(y+row*tileHeight)*layer.width+x+col*tileWidth,old=layer.values.get(index)??0,oldAlpha=(old>>>24)/255;let value;
    if(erase){const next=Math.round(oldAlpha*(1-alpha)*255);value=next?((old&0xffffff)|(next<<24))>>>0:0}
    else{const source=index*4,light=(.2126*original[source]+.7152*original[source+1]+.0722*original[source+2])/255,shade=(Math.max(0,light)/Math.max(.025,reference))**.85,outAlpha=alpha+oldAlpha*(1-alpha),out=rgb.map((channel,k)=>Math.round((Math.min(255,channel*shade)*alpha+((old>>>(k*8))&255)*oldAlpha*(1-alpha))/outAlpha));value=pack(...out,Math.round(outAlpha*255))}
    if(value===old)continue;if(!before.has(index))before.set(index,old);layer.set(index,value);changed++;
   }
  }
 }
 return changed;
}
