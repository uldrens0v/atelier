import * as THREE from 'three';
import {colourAtUv} from './colour-sampler.mjs';
export class ModelEyedropper{
 constructor({button,canvas,getContext,onPick,onArm=()=>{},onStatus=()=>{}}){
  Object.assign(this,{button,canvas,getContext,onPick,onArm,onStatus});this.active=false;this.pointer=null;this.ray=new THREE.Raycaster();
  button.onclick=()=>this.active?this.cancel():this.arm();
  canvas.addEventListener('pointerdown',event=>{
   if(!this.active||event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();this.pointer=event.pointerId;
   const colour=this.pick(event.clientX,event.clientY);if(!colour){onStatus('Choose a visible coloured surface.');return}
   const handler=this.pickHandler??onPick;this.cancel();handler(colour);onStatus('Colour picked: '+colour.toUpperCase());
  },true);
  canvas.addEventListener('pointerup',event=>{if(event.pointerId===this.pointer){event.preventDefault();event.stopImmediatePropagation();this.pointer=null}},true);
  window.addEventListener('keydown',event=>{if(event.key==='Escape')this.cancel()});
 }
 arm({original=false,onPick=null}={}){if(this.active)this.cancel();const context=this.getContext();if(!context?.mesh)return;this.forceOriginal=original;this.pickHandler=onPick;this.active=true;this.previousCursor=this.canvas.style.cursor;this.onArm();this.canvas.style.cursor='crosshair';this.button.setAttribute('aria-pressed','true');this.onStatus(original?'Pick the original surface colour to isolate. Esc to cancel.':'Click the model to pick a colour. Esc to cancel.')}
 cancel(){if(!this.active)return;this.active=false;this.forceOriginal=false;this.pickHandler=null;this.canvas.style.cursor=this.previousCursor??'';this.button.setAttribute('aria-pressed','false')}
 pick(x,y){
  const context=this.getContext();if(!context?.mesh)return null;
  const rect=this.canvas.getBoundingClientRect(),pane=rect.width/(context.split?2:1),local=x-rect.left,original=this.forceOriginal||context.split&&local<pane;
  this.ray.setFromCamera(new THREE.Vector2((local%pane)/pane*2-1,-(y-rect.top)/rect.height*2+1),context.camera);
  context.mesh.updateMatrixWorld(true);if(context.mesh.isSkinnedMesh){context.mesh.computeBoundingSphere();context.mesh.boundingBox=null}
  for(const hit of this.ray.intersectObject(context.mesh,false)){
   const material=context.mesh.material[hit.face.materialIndex];if(!material?.visible)continue;
   if(material.userData.nativePolicy?.parameterSelection)return null;
   const record=context.records.find(record=>record.texture===material.map);if(!record)continue;
   const colour=colourAtUv(record,hit.uv,original);if(colour)return colour;
  }
  return null;
 }
}
