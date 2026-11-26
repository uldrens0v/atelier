export function selectionPane(bounds,split,x,logicalWidth=bounds.width){
 const middle=bounds.left+bounds.width*Math.floor(logicalWidth/2)/logicalWidth,left=split&&x>=middle?middle:bounds.left,right=split&&x<middle?middle:bounds.left+bounds.width;
 return{left,top:bounds.top,right,bottom:bounds.top+bounds.height,width:right-left,height:bounds.height};
}
export function selectionRectangle(start,end,pane){
 const x=Math.max(pane.left,Math.min(pane.right,end.x)),y=Math.max(pane.top,Math.min(pane.bottom,end.y)),left=Math.min(start.x,x),top=Math.min(start.y,y);
 return{left,top,right:Math.max(start.x,x),bottom:Math.max(start.y,y),width:Math.abs(x-start.x),height:Math.abs(y-start.y)};
}
export function selectionPixels(rect,pane,width,height){
 const x=Math.max(0,Math.floor((rect.left-pane.left)/pane.width*width)),right=Math.min(width,Math.ceil((rect.right-pane.left)/pane.width*width)),y=Math.max(0,Math.floor((pane.bottom-rect.bottom)/pane.height*height)),top=Math.min(height,Math.ceil((pane.bottom-rect.top)/pane.height*height));
 return{x,y,width:Math.max(0,right-x),height:Math.max(0,top-y)};
}
export function rolesFromPixels(pixels,count){
 const roles=new Set();for(let i=0;i<pixels.length;i+=4){const id=pixels[i]+pixels[i+1]*256+pixels[i+2]*65536;if(id>0&&id<=count)roles.add(id-1)}return [...roles].sort((a,b)=>a-b);
}
export function rectangleSelection(previous,found,additive){return [...new Set([...(additive?previous:[]),...found])]}
