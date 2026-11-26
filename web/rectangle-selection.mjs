import {RectanglePicker} from './rectangle-picker.mjs';
import {selectionPane,selectionRectangle,rectangleSelection} from './rectangle-selection-data.mjs';

export class RectangleSelection{
 constructor({canvas,getContext,onSelection,onStart=()=>{},onError=()=>{}}){
  Object.assign(this,{canvas,getContext,onSelection,onStart,onError});this.drag=null;this.picker=null;this.box=document.createElement('div');this.box.className='rectangle-selection';this.box.hidden=true;this.box.setAttribute('aria-hidden','true');document.body.appendChild(this.box);
  canvas.addEventListener('pointerdown',event=>this.down(event),true);canvas.addEventListener('pointermove',event=>this.move(event),true);canvas.addEventListener('pointerup',event=>this.up(event),true);canvas.addEventListener('pointercancel',()=>this.cancel(),true);canvas.addEventListener('lostpointercapture',()=>this.cancel());
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.drag){event.preventDefault();this.cancel()}});window.addEventListener('blur',()=>this.cancel());window.addEventListener('resize',()=>this.cancel());
 }
 down(event){
  if(event.button!==0||!event.ctrlKey||this.drag)return;const context=this.getContext();if(!context)return;event.preventDefault();event.stopImmediatePropagation();this.onStart();
  const bounds=this.canvas.getBoundingClientRect(),logicalWidth=this.canvas.width/context.renderer.getPixelRatio(),pane=selectionPane(bounds,context.split,event.clientX,logicalWidth),controls=context.controls;
  this.drag={context,pane,start:{x:event.clientX,y:event.clientY},rect:null,pointer:event.pointerId,additive:event.shiftKey,previous:context.selection.slice(),enabled:controls.enabled,damping:controls.enableDamping,autoRotate:controls.autoRotate,playing:context.player.playing,cursor:this.canvas.style.cursor};
  context.player.playing=false;context.player.syncPlay();controls.autoRotate=false;controls.enableDamping=false;controls.update();controls.enabled=false;this.canvas.style.cursor='crosshair';this.canvas.setPointerCapture(event.pointerId);
 }
 move(event){
  const drag=this.drag;if(!drag||drag.pointer!==event.pointerId)return;event.preventDefault();event.stopImmediatePropagation();drag.rect=selectionRectangle(drag.start,{x:event.clientX,y:event.clientY},drag.pane);this.box.hidden=false;Object.assign(this.box.style,{left:drag.rect.left+'px',top:drag.rect.top+'px',width:drag.rect.width+'px',height:drag.rect.height+'px'});this.box.classList.toggle('additive',drag.additive);
 }
 up(event){
  const drag=this.drag;if(!drag||drag.pointer!==event.pointerId)return;event.preventDefault();event.stopImmediatePropagation();drag.rect=selectionRectangle(drag.start,{x:event.clientX,y:event.clientY},drag.pane);
  try{if(Math.max(drag.rect.width,drag.rect.height)>=4){this.picker??=new RectanglePicker(drag.context.renderer);const found=this.picker.select(drag.context,drag.rect,drag.pane);this.onSelection(rectangleSelection(drag.previous,found,drag.additive),drag.additive)}}catch(error){this.onError(error)}finally{this.release()}
 }
 release(){
  const drag=this.drag;if(!drag)return;this.drag=null;this.box.hidden=true;Object.assign(drag.context.controls,{enabled:drag.enabled,enableDamping:drag.damping,autoRotate:drag.autoRotate});drag.context.player.playing=drag.playing;drag.context.player.syncPlay();this.canvas.style.cursor=drag.cursor;if(this.canvas.hasPointerCapture(drag.pointer))this.canvas.releasePointerCapture(drag.pointer);
 }
 cancel(){this.release()}
 reset(){this.cancel();this.picker?.clear()}
}
