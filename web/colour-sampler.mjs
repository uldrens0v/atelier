export function colourAtUv(record,uv,original=false){
 const width=record.canvas.width,height=record.canvas.height,columns=record.atlas?.columns??1,rows=record.atlas?.rows??1;
 const x=Math.min(width-1,Math.floor(((uv.x%1+1)%1)*width/columns)),y=Math.min(height-1,Math.floor(((uv.y%1+1)%1)*height/rows));
 const pixels=original?record.original:record.pixels.data,offset=(y*width+x)*4;
 if(pixels[offset+3]===0)return null;
 return '#'+[0,1,2].map(i=>pixels[offset+i].toString(16).padStart(2,'0')).join('');
}
