import * as THREE from 'three';
import {animationClip,restorePose} from './animation-engine.mjs';

export class AnimationPlayer{
 constructor(element){
  this.element=element;element.title='Character motion only. Particle effects are not shown.';this.ticket=0;this.cache=new Map();this.playing=false;this.speed=1;this.time=0;this.duration=0;this.changed=false;
  element.innerHTML='<div class="animation-heading"><span>ANIMATION</span><span class="animation-status" role="status" aria-live="polite">Loading…</span></div><div class="animation-controls"><select aria-label="Animation" disabled><option>Loading…</option></select><button type="button" class="animation-toggle" aria-label="Play animation" title="Play" disabled>▶</button><button type="button" class="animation-restart" aria-label="Restart animation" title="Restart" disabled>↺</button><select class="animation-speed" aria-label="Playback speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div><div class="animation-timeline"><input type="range" min="0" max="1" step="0.001" value="0" aria-label="Animation timeline" disabled><output>0.00 / 0.00 s</output></div>';
  this.select=element.querySelector('select');this.toggle=element.querySelector('.animation-toggle');this.restart=element.querySelector('.animation-restart');this.timeline=element.querySelector('input');this.output=element.querySelector('output');this.status=element.querySelector('.animation-status');
  this.select.onchange=()=>this.choose(this.select.value);this.toggle.onclick=()=>{if(!this.playing&&this.time>=this.duration)this.seek(0);this.playing=!this.playing;this.syncPlay()};this.restart.onclick=()=>{this.seek(0);this.playing=true;this.syncPlay()};element.querySelector('.animation-speed').onchange=event=>this.speed=Number(event.target.value);this.timeline.oninput=()=>{this.playing=false;this.syncPlay();this.seek(Number(this.timeline.value))};
 }
 clear(){this.ticket++;if(this.mixer){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.mesh)}this.mixer=null;this.mesh=null;this.action=null;this.sequence=[];this.playing=false;this.syncPlay();this.time=0;this.duration=0;this.cache.clear();this.select.disabled=true;this.toggle.disabled=true;this.restart.disabled=true;this.timeline.disabled=true;this.status.textContent='Loading…';this.output.value='0.00 / 0.00 s';this.timeline.value=0}
 async load(mesh,manifest){
  this.clear();this.mesh=mesh;this.manifest=manifest;this.select.replaceChildren();const bind=new Option('T-pose','');this.select.add(bind);
  if(!mesh.isSkinnedMesh||!manifest?.clips?.length){this.status.textContent='No clips available';return}
  this.mixer=new THREE.AnimationMixer(mesh);for(const clip of manifest.clips)this.select.add(new Option(clip.label,clip.id));this.select.disabled=false;this.select.value='';await this.choose('');
 }
 async choose(id){
  const ticket=++this.ticket;this.mixer?.stopAllAction();restorePose(this.mesh);this.action=null;this.sequence=[];this.time=0;this.duration=0;this.timeline.value=0;this.timeline.disabled=true;this.toggle.disabled=true;this.restart.disabled=true;this.changed=true;if(this.mesh){delete this.mesh.userData.animationBounds;this.mesh.userData.followMotion=false;}this.output.value='0.00 / 0.00 s';
  if(!id){this.playing=false;this.syncPlay();this.status.textContent='';this.output.value='0.00 / 0.00 s';this.onFrame?.();return}
  const selected=this.manifest.clips.find(clip=>clip.id===id);this.status.textContent='Loading…';
  try{
   const sequence=[];
   for(const layer of selected.layers??selected.assets.map(path=>[path])){const clips=[];for(const path of layer){if(!this.cache.has(path))this.cache.set(path,fetch('./'+path).then(response=>{if(!response.ok)throw Error('Animation unavailable.');return response.json()}).catch(error=>{this.cache.delete(path);throw error}));const data=await this.cache.get(path);if(ticket!==this.ticket)return;clips.push(animationClip(THREE,data,this.mesh,id+'-'+sequence.length))}const tracks=new Map();for(const clip of clips)for(const track of clip.tracks)if(!tracks.has(track.name))tracks.set(track.name,track);const clip=new THREE.AnimationClip(id+'-'+sequence.length,Math.max(...clips.map(clip=>clip.duration)),[...tracks.values()]);sequence.push({clip,action:this.mixer.clipAction(clip)})}
   if(ticket!==this.ticket)return;this.sequence=sequence;this.duration=sequence.reduce((sum,item)=>sum+item.clip.duration,0);this.timeline.max=this.duration;this.timeline.disabled=false;this.toggle.disabled=false;this.restart.disabled=false;this.loop=selected.loop!==false;this.playing=true;this.status.textContent='';this.seek(0);if(this.captureBounds){const bounds=new THREE.Box3();for(const portion of [0,.25,.5,.75,1]){this.seek(this.duration*portion);bounds.union(this.captureBounds(this.mesh))}this.mesh.userData.animationBounds=bounds;this.seek(0);this.onFrame?.()}this.syncPlay();
  }catch(error){if(ticket!==this.ticket)return;this.status.textContent=error.message;restorePose(this.mesh);this.changed=true}
 }
 syncPlay(){this.toggle.textContent=this.playing?'Ⅱ':'▶';this.toggle.setAttribute('aria-label',this.playing?'Pause animation':'Play animation');this.toggle.title=this.playing?'Pause':'Play';this.toggle.setAttribute('aria-pressed',String(this.playing))}
 seek(time){
  if(!this.sequence.length)return;this.time=Math.max(0,Math.min(this.duration,time));let local=this.time,index=0;while(index<this.sequence.length-1&&local>=this.sequence[index].clip.duration){local-=this.sequence[index].clip.duration;index++}const item=this.sequence[index];if(this.action!==item.action){this.mixer.stopAllAction();restorePose(this.mesh);this.action=item.action;this.action.reset().setLoop(THREE.LoopOnce,1);this.action.clampWhenFinished=true;this.action.play()}
  this.action.paused=false;this.action.enabled=true;this.action.time=Math.min(local,item.clip.duration);this.mixer.update(0);this.action.paused=true;this.mesh.updateMatrixWorld(true);this.mesh.skeleton.update();this.onPose?.(this.mesh);this.timeline.value=this.time;this.output.value=this.time.toFixed(2)+' / '+this.duration.toFixed(2)+' s';this.changed=true;
 }
 update(delta){if(!this.mesh||!this.sequence.length||!this.playing||document.hidden)return;let time=this.time+Math.min(delta,.1)*this.speed;if(time>=this.duration){if(this.loop)time%=this.duration;else{time=this.duration;this.playing=false;this.syncPlay()}}this.seek(time)}
}
