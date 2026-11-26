import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadJson} from './resource-cache.mjs';
import {loadMaskData} from './mask-data.mjs';
import {colourNativeSystem,abilityTexturePixels} from './ability-colour.mjs';
import {particleSample,particleRgba,phaseStart,phaseOrigin,emissionTimes,sampleValue} from './vfx-math.mjs';

import {flightDuration} from './vfx-motion.mjs';
import {surfaceVertex,surfaceFragment,uvLayer,surfaceValues} from './vfx-surface.mjs';
import {ribbonVertices} from './vfx-ribbon.mjs';
import {EffectColourSamples} from './effect-colour-samples.mjs';
import {abilityMatchesSlot,abilityView} from './ability-kits.mjs';

const defaults={enabled:false,colour:'#dd69c2',saturation:1,tintHighlights:false};
const slots=['Q','W','E','R','P','All','AA','Other'];

function abilityButton(slot,icon,atlas,active){
 const button=document.createElement('button');
 button.type='button';
 button.dataset.abilitySlot=slot;
 button.setAttribute('aria-pressed',String(active));
 const name=icon?.[1];
 if(name){
  button.title=name;
  button.setAttribute('aria-label',slot+' · '+name);
 }
 if(icon){
  const [tile]=icon,{file,revision,columns,rows}=atlas;
  const atlasUrl=new URL('./'+file+'?v='+revision,import.meta.url).href;
  const art=document.createElement('span');
  art.className='ability-icon';
  art.setAttribute('aria-hidden','true');
  art.style.backgroundImage='url("'+atlasUrl+'")';
  art.style.backgroundSize=(columns*100)+'% '+(rows*100)+'%';
  art.style.backgroundPosition=(tile%columns)/(columns-1)*100+'% '+Math.floor(tile/columns)/Math.max(rows-1,1)*100+'%';
  button.classList.add('has-icon');
  button.append(art);
 }
 const key=document.createElement('span');
 key.className='ability-key';
 key.textContent=slot;
 button.append(key);
 return button;
}
function textureFrom(image){const texture=new THREE.DataTexture(new Uint8ClampedArray(image.pixels),image.width,image.height);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture}
function blend(material,mode){material.blending=THREE.CustomBlending;material.blendEquation=THREE.AddEquation;material.blendSrc=THREE.OneFactor;material.blendDst=THREE.OneFactor;material.depthWrite=mode===3;if(mode===1){material.blendSrc=THREE.SrcAlphaFactor;material.blendDst=THREE.OneMinusSrcAlphaFactor}if(mode===2){material.blendSrc=THREE.ZeroFactor;material.blendDst=THREE.OneMinusSrcColorFactor}if(mode===3)material.blending=THREE.NoBlending;if(mode===4)material.blendSrc=THREE.SrcAlphaFactor;if(mode===5)material.blendDst=THREE.OneMinusSrcAlphaFactor;if(mode===6)material.blendEquation=THREE.MinEquation;if(mode===7)material.blendEquation=THREE.MaxEquation}
export class AbilityPreview{
 constructor({viewport,palette,getState,onEdit,onError,changeModelForm}){
  this.getState=getState;this.onEdit=onEdit;this.onError=onError;this.ticket=0;this.time=0;this.speed=1;this.playing=true;this.active=false;this.records=[];this.textures=new Map();this.cache=new Map();
  this.panel=document.createElement('details');this.panel.className='editor-disclosure ability-panel';this.panel.hidden=true;this.panel.innerHTML='<summary>Ability effects</summary><div class="ability-form" hidden><span data-ability-form aria-live="polite"></span><button type="button" data-change-form>Change form</button></div><div class="ability-tabs" role="group" aria-label="Ability"></div><label class="projectile-label">Effect<select aria-label="Effect"></select></label><p class="projectile-status" role="status"></p><div class="ability-colour"><label><input type="checkbox" data-enabled> Custom colour</label><div class="ability-colour-row"><input type="color" value="#dd69c2" aria-label="Ability colour"><input type="text" value="#DD69C2" maxlength="7" aria-label="Ability hex code"></div><label class="ability-highlight"><input type="checkbox" data-highlights> Tint bright highlights</label><button type="button" data-preview>Preview effect</button><button type="button" data-reset>Reset effect colour</button></div>';palette.insertBefore(this.panel,palette.querySelector('.selection-legend'));
  this.element=document.createElement('section');this.element.className='ability-preview';this.element.hidden=true;this.element.setAttribute('aria-label','Ability preview');this.element.innerHTML='<div class="ability-heading"><div><strong>Q · Mystic Shot</strong><span>Reconstructed preview · native game assets</span></div><button type="button" data-close>← Back to model</button></div><div class="ability-canvas"></div><div class="ability-comparison" hidden><span>Original</span><span>Custom colour</span></div><div class="ability-player"><div class="ability-phase" role="status">Launch</div><div class="ability-timeline"><button type="button" data-play aria-label="Pause effect">Ⅱ</button><button type="button" data-replay aria-label="Replay effect">↺</button><input type="range" min="0" max="2.2" step="0.005" value="0" aria-label="Effect timeline"><output>0.00 s</output><select aria-label="Effect speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option></select><label><input type="checkbox" data-compare checked> Compare</label></div><p>Launch, flight and impact. Lighting and attachment timing may differ in game.</p></div>';viewport.append(this.element);
  const find=selector=>this.panel.querySelector(selector);this.enabled=find('[data-enabled]');this.colour=find('[type=color]');this.hex=find('[type=text]');this.highlights=find('[data-highlights]');this.tabs=find('.ability-tabs');this.projectileSelect=find('[aria-label=Effect]');this.status=find('.projectile-status');this.previewButton=find('[data-preview]');this.resetButton=find('[data-reset]');this.projectileSelect.onchange=()=>this.choose(this.projectileSelect.value);
  this.formRow=find('.ability-form');
  this.formName=find('[data-ability-form]');
  this.formButton=find('[data-change-form]');
  this.formButton.onclick=async()=>{
   const next=this.view.next;
   if(!next)return;
   if(!next.model){this.setForm(next.id);return}
   this.formButton.disabled=true;
   try{await changeModelForm(next.model)}
   catch(error){this.onError(error)}
   finally{this.formButton.disabled=false}
  };
  const edit=(key,value)=>{onEdit(()=>{const state=getState();state.abilityVfx??={};state.abilityVfx[this.abilityId]={...this.defaultSettings(),...state.abilityVfx[this.abilityId],[key]:value}},'ability-'+this.abilityId+'-'+key);this.sync()};this.enabled.onchange=()=>edit('enabled',this.enabled.checked);this.colour.oninput=()=>{onEdit(()=>{const state=getState();state.abilityVfx??={};state.abilityVfx[this.abilityId]={...this.defaultSettings(),...state.abilityVfx[this.abilityId],enabled:true,colour:this.colour.value}},'ability-'+this.abilityId+'-colour');this.sync()};this.hex.onchange=()=>{if(/^#[a-f0-9]{6}$/i.test(this.hex.value)){this.colour.value=this.hex.value;this.colour.oninput()}else this.sync()};this.highlights.onchange=()=>edit('tintHighlights',this.highlights.checked);find('[data-reset]').onclick=()=>{onEdit(()=>{delete getState().abilityVfx?.[this.abilityId]});this.sync()};find('[data-preview]').onclick=()=>this.open().catch(onError);
  this.element.querySelector('[data-close]').onclick=()=>this.close();this.playButton=this.element.querySelector('[data-play]');this.playButton.onclick=()=>{this.playing=!this.playing;this.syncPlay()};this.element.querySelector('[data-replay]').onclick=()=>{this.time=0;this.playing=true;this.syncPlay()};this.timeline=this.element.querySelector('[type=range]');this.timeline.oninput=()=>{this.time=Number(this.timeline.value);this.playing=false;this.syncPlay();this.render()};this.element.querySelector('select').onchange=event=>this.speed=Number(event.target.value);this.comparison=this.element.querySelector('[data-compare]');this.comparison.onchange=()=>this.render();
 }
 defaultSettings(){return{...defaults,tintHighlights:!!this.abilities?.find(ability=>ability.id===this.abilityId)?.tintHighlightsDefault}}
 syncPlay(){this.playButton.textContent=this.playing?'Ⅱ':'▶';this.playButton.setAttribute('aria-label',this.playing?'Pause effect':'Play effect')}
 sync(){
  const value={...this.defaultSettings(),...this.getState()?.abilityVfx?.[this.abilityId]};
  this.enabled.checked=value.enabled;
  this.colour.value=value.colour;
  this.hex.value=value.colour.toUpperCase();
  this.highlights.checked=value.tintHighlights;
  const ability=this.abilities?.find(ability=>ability.id===this.abilityId);
  this.previewButton.disabled=!this.canPreview();
  this.previewButton.textContent=ability?.previewKind==='colour-samples'?'Compare colours ↗':'Preview effect ↗';
  this.resetButton.textContent='Reset effect colour';
  this.status.textContent=ability&&!this.canPreview()?'Colour export is ready. Preview unavailable.':'';
  this.status.hidden=!this.status.textContent;
  this.cache.clear();
  if(this.samples)this.samples.render(value);
  else if(this.active)this.render();
 }
 setSkin(skin){
  this.skin=skin;
  if(!skin){
   this.close();
   this.disposeAssets();
   this.panel.hidden=true;
   return;
  }
  if(this.skinId!==skin.id){
   this.filter='All';
   this.abilityId=undefined;
   this.skinId=skin.id;
  }
  this.setForm(skin?.formId??skin?.formContext);
 }
 setForm(form){
  this.close();
  this.disposeAssets();
  this.view=abilityView(this.skin,form);
  this.abilities=this.view.effects;
  this.panel.hidden=!this.abilities.length;
  this.formRow.hidden=!this.view.next;
  this.formName.textContent=this.view.current?.label??'';
  this.formButton.title=this.view.next?'Switch to '+this.view.next.label:'';
  if(!this.abilities.some(effect=>abilityMatchesSlot(effect,this.filter)))this.filter='All';
  const choices=this.abilities.filter(effect=>abilityMatchesSlot(effect,this.filter));
  if(!choices.some(effect=>effect.id===this.abilityId))this.abilityId=choices[0]?.id;
  this.renderOptions();
  this.sync();
 }
 renderOptions(){
  this.tabs.replaceChildren();
  for(const slot of slots){
   const icon=this.view.icons[slot];
   const effects=this.abilities.filter(effect=>abilityMatchesSlot(effect,slot));
   if(!icon&&!effects.length)continue;
   const button=abilityButton(slot,icon,this.view.atlas,slot===this.filter);
   button.disabled=!effects.length;
   button.onclick=()=>{
    this.filter=slot;
    if(!effects.some(effect=>effect.id===this.abilityId))this.choose(effects[0].id);
    this.renderOptions();
    this.tabs.querySelector('[aria-pressed="true"]')?.focus();
   };
   this.tabs.append(button);
  }
  this.projectileSelect.replaceChildren();
  for(const effect of this.abilities.filter(effect=>abilityMatchesSlot(effect,this.filter))){
   this.projectileSelect.add(new Option(effect.name,effect.id));
  }
  this.projectileSelect.value=this.abilityId??'';
 }
 choose(id){if(!this.abilities.some(ability=>ability.id===id))return;const reopen=!this.element.hidden;this.close();this.disposeAssets();this.abilityId=id;this.projectileSelect.value=id;this.sync();if(reopen&&this.canPreview())this.open().catch(this.onError)}
 canPreview(){
  const ability=this.abilities?.find(ability=>ability.id===this.abilityId);
  return !!(ability?.asset&&ability.previewAvailable!==false || ability?.previewKind&&this.skin?.abilityVfx?.effectLayerAsset);
 }

 async loadPreview(ability){
  if(ability.asset&&ability.previewAvailable!==false)return loadJson('./'+ability.asset);
  const bundle=await loadJson('./'+this.skin.abilityVfx.effectLayerAsset,{ttl:60000,cache:'no-cache'});
  const data=bundle.abilities?.[ability.id];
  if(!data||data.preview?.kind!==ability.previewKind)throw Error('Effect preview changed. Reload the skin.');
  return data;
 }

 async open(){
  if(!this.canPreview())return;const ticket=++this.ticket;this.panel.open=true;this.element.hidden=false;this.element.classList.add('is-loading');this.element.querySelector('.ability-phase').textContent='Loading effect…';
  try{
   if(!this.data){
    const ability=this.abilities.find(value=>value.id===this.abilityId),data=await this.loadPreview(ability);
    if(ticket!==this.ticket)return;
    const [textures,meshes]=await Promise.all([
     Promise.all(Object.entries(data.textures).map(async([path,record])=>[path,{...record,image:await loadMaskData('./'+record.asset)}])),
     Promise.all(Object.entries(data.meshes??{}).map(async([path,record])=>[path,await loadJson('./'+record.asset)]))
    ]);
    if(ticket!==this.ticket)return;
    const kind=data.preview?.kind;
    this.element.querySelector('.ability-heading strong').textContent=ability.name;
    this.element.querySelector('.ability-heading span').textContent=kind==='colour-samples'?'Exported colour samples':kind==='effect-layer'?'Animated effect layer · native game assets':'Reconstructed preview · native game assets';
    this.element.querySelector('.ability-player p').textContent=kind==='effect-layer'?'Shows a layer of the effect. Other layers and timing can differ in game.':'Launch, flight and impact. Lighting and attachment timing may differ in game.';
    this.data=data;
    if(kind==='colour-samples'){
     this.samples=new EffectColourSamples(data,textures);
     this.element.querySelector('.ability-canvas').append(this.samples.element);
    }else{
     this.distance=data.range;
     this.duration=data.duration;
     this.timeline.max=String(data.duration);
     this.textures=new Map(textures.map(([path,value])=>[path,{...value,original:textureFrom(value.image),changed:textureFrom(value.image)}]));
     this.meshes=new Map(meshes);
     this.initialize();
    }
   }
   if(ticket!==this.ticket)return;
   this.active=true;
   this.time=0;
   this.playing=true;
   this.element.classList.remove('is-loading');
   this.element.classList.toggle('has-colour-samples',!!this.samples);
   if(this.renderer)this.renderer.domElement.hidden=!!this.samples;
   this.syncPlay();
   this.sync();
  }catch(error){if(ticket===this.ticket){this.active=false;this.disposeAssets();this.element.hidden=true;this.element.classList.remove('is-loading')}throw error}
 }
 initialize(){
  if(!this.renderer){this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.setClearColor(0x101013,1);this.element.querySelector('.ability-canvas').append(this.renderer.domElement);this.camera=new THREE.PerspectiveCamera(35,1,1,10000);this.camera.up.set(0,0,1);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.minDistance=350;this.controls.maxDistance=4000;this.controls.maxPolarAngle=Math.PI*.85;this.resizeObserver=new ResizeObserver(()=>{if(this.active)this.render()});this.resizeObserver.observe(this.element)}
  const stationary=this.data.preview?.stationary;
  const beam=this.data.preview?.beam;
  this.scene=new THREE.Scene();
  this.camera.position.set(this.distance*(beam?1.55:.92),beam?this.distance*.3:-this.distance*(stationary?1.3:.3),this.distance*(beam||stationary?1.1:.88));
  this.controls.target.set(0,stationary?0:this.distance*.475,stationary?120:80);
  this.controls.update();
  const grid=new THREE.GridHelper(this.distance*(stationary?3:1.85),44,0x44444b,0x27272d);
  grid.rotation.x=Math.PI/2;
  grid.position.y=stationary?0:this.distance/2;
  this.scene.add(grid);
  for(const y of stationary?[0]:[0,this.distance]){const marker=new THREE.Mesh(new THREE.RingGeometry(38,40,48),new THREE.MeshBasicMaterial({color:0x686872,side:THREE.DoubleSide}));marker.position.set(0,y,1);this.scene.add(marker)}
  this.records=[];this.whiteTexture??=textureFrom({width:1,height:1,pixels:new Uint8Array([255,255,255,255])});for(const system of this.data.systems)for(const [index,emitter]of (system.data.complexEmitterDefinitionData??[]).entries()){
   if(emitter.disabled||emitter.primitive?._type==='VfxPrimitiveNonRenderable')continue;const type=emitter.primitive?._type??'VfxPrimitiveCameraQuad',isMesh=type==='VfxPrimitiveMesh',isRibbon=/Trail$/.test(type),meshData=isMesh?this.meshes.get(emitter.primitive?.mMesh?.mSimpleMeshName):null;
   let geometry;if(isMesh){if(!meshData)throw Error('The original effect mesh is missing.');geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(meshData.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(meshData.uvs,2))}else geometry=isRibbon?new THREE.BufferGeometry():new THREE.PlaneGeometry(type==='VfxPrimitiveCameraUnitQuad'?1:2,type==='VfxPrimitiveCameraUnitQuad'?1:2);
   const times=emissionTimes(emitter,system.phase==='flight'?flightDuration(this.data,this.distance):1),count=Math.max(1,times.length),capacity=isRibbon?Math.max(6,count*6):count,Attribute=isRibbon?THREE.BufferAttribute:THREE.InstancedBufferAttribute,rgba=new Attribute(new Float32Array(capacity*4),4),uv=new Attribute(new Float32Array(capacity*4),4),uv2=new Attribute(new Float32Array(capacity*4),4),turn=new Attribute(new Float32Array(capacity*2),2),surface=new Attribute(new Float32Array(capacity*4),4),paletteMix=new Attribute(new Float32Array(capacity*4),4),paletteRow=new Attribute(new Float32Array(capacity),1);
   for(const [name,value]of Object.entries({particleColour:rgba,particleUV:uv,particleUV2:uv2,particleTurn:turn,surfaceData:surface,paletteMix,particlePaletteRow:paletteRow}))geometry.setAttribute(name,value);
   if(isRibbon){geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity*3),3));geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(capacity*2),2))}
   const variants={},use=(name,path,kind,address=0)=>{const image=this.textures.get(path);if(!image){if(path)throw Error('An original effect texture is missing.');return variants[name]={original:this.whiteTexture,changed:this.whiteTexture,colourEditable:false,shared:true}}const original=image.original.clone(),changed=image.changed.clone(),samplers=kind==='base'?[THREE.RepeatWrapping,THREE.MirroredRepeatWrapping,THREE.ClampToEdgeWrapping]:[THREE.RepeatWrapping,THREE.ClampToEdgeWrapping,THREE.MirroredRepeatWrapping];for(const texture of [original,changed]){texture.wrapS=texture.wrapT=samplers[address]??THREE.ClampToEdgeWrapping;if(kind==='data')texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true}return variants[name]={...image,original,changed}};
   use('image',emitter.texture,'base',emitter.texAddressModeBase??0);const secondary=emitter.textureMult,erosion=emitter.alphaErosionDefinition,palette=emitter.paletteDefinition;use('secondImage',secondary?.textureMult,'base',secondary?.texAddressModeMult??0);use('erosionImage',erosion?.erosionMapName,'data',erosion?.erosionMapAddressMode??2);use('lookupImage',emitter.particleColorTexture,'lookup',1);use('paletteImage',palette?.paletteTexture,'lookup',palette?.PaletteTextureAddressMode??1);
   const mode=emitter.blendMode??0,lookup=!!emitter.particleColorTexture&&!erosion&&!(isMesh&&secondary?.textureMult),scalar=(value,fallback)=>sampleValue(value,0,1,fallback),material=new THREE.ShaderMaterial({defines:isRibbon?{RIBBON:1}:{},vertexShader:surfaceVertex,fragmentShader:surfaceFragment,uniforms:{image:{value:variants.image.original},secondImage:{value:variants.secondImage.original},erosionImage:{value:variants.erosionImage.original},lookupImage:{value:variants.lookupImage.original},paletteImage:{value:variants.paletteImage.original},hasSecond:{value:!!secondary?.textureMult},hasErosion:{value:!!erosion?.erosionMapName},hasPalette:{value:!!palette?.paletteTexture&&(palette.paletteCount??1)>0},lookupMode:{value:lookup?(secondary?.textureMult?2:1):0},lockedAlpha:{value:emitter.uvMode===2},premultiply:{value:mode===0||mode===2},alphaCutoff:{value:(emitter.alphaRef??5)/255},erosionParams:{value:new THREE.Vector3(scalar(erosion?.erosionSliceWidth,1.5),1/Math.max(.000001,scalar(erosion?.erosionFeatherIn,.1)),scalar(erosion?.erosionFeatherOut,.1)>1e-6?1/scalar(erosion?.erosionFeatherOut,.1):0)},erosionMixer:{value:new THREE.Vector4(...sampleValue(erosion?.erosionMapChannelMixer,0,1,[0,0,0,1]))},baseDiv:{value:new THREE.Vector2(...(emitter.texDiv??[1,1])).max(new THREE.Vector2(.0001,.0001))},secondDiv:{value:new THREE.Vector2(...(secondary?.texDivMult??[1,1])).max(new THREE.Vector2(.0001,.0001))},baseCenter:{value:new THREE.Vector2(...(emitter.uvTransformCenter??[.5,.5]))},secondCenter:{value:new THREE.Vector2(...(secondary?.uvTransformCenterMult??[.5,.5]))},baseFlip:{value:new THREE.Vector2(emitter.TextureFlipU?1:0,emitter.TextureFlipV?1:0)},secondFlip:{value:new THREE.Vector2(secondary?.TextureMultFilpU?1:0,secondary?.TextureMultFilpV?1:0)},meshSurface:{value:isMesh}},transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide});blend(material,mode);const object=isRibbon?new THREE.Mesh(geometry,material):new THREE.InstancedMesh(geometry,material,count);object.frustumCulled=false;object.renderOrder=(emitter.pass??0)+1100;this.scene.add(object);this.records.push({system,emitter,type,object,rgba,uv,uv2,turn,surface,paletteMix,paletteRow,times,index,variants,isRibbon,kinematics:new Map()});
  }
 }

 close(){this.ticket++;this.active=false;this.element.hidden=true}
 disposeAssets(){this.samples?.dispose();this.samples=null;this.data=null;this.settingsKey=null;this.cache.clear();if(this.scene){this.scene.traverse(object=>{object.geometry?.dispose();if(object.material)object.material.dispose()});this.scene=null}for(const record of this.records)for(const variant of Object.values(record.variants??{}))if(!variant.shared){variant.original.dispose();variant.changed.dispose()}for(const value of this.textures.values()){value.original.dispose();value.changed.dispose()}this.textures.clear();this.records=[]}
 update(delta){if(!this.active||this.samples)return;if(this.playing)this.time=(this.time+Math.min(delta,.1)*this.speed)%this.duration;this.controls.update();this.render()}
 renderPass(original,width,height,x){
  const settings={...this.defaultSettings(),...this.getState()?.abilityVfx?.[this.abilityId]},key=JSON.stringify(settings);if(this.settingsKey!==key){for(const texture of this.textures.values())if(texture.colourEditable){texture.changed.image.data.set(abilityTexturePixels(texture.image.pixels,settings));texture.changed.needsUpdate=true}for(const record of this.records)for(const variant of Object.values(record.variants))if(!variant.shared&&variant.colourEditable)variant.changed.needsUpdate=true;this.settingsKey=key;this.cache.clear()}
  const transform=new THREE.Object3D(),rotation=new THREE.Euler(),position=new THREE.Vector3(),scale=new THREE.Vector3(),cameraRotation=this.camera.quaternion.clone(),frame=Math.round(this.time*60),time=frame/60;
  const beamStart=new THREE.Vector3(),beamEnd=new THREE.Vector3(),beamAxis=new THREE.Vector3(),beamWidth=new THREE.Vector3(),beamNormal=new THREE.Vector3(),beamBasis=new THREE.Matrix4();
  for(const record of this.records){
   const {emitter,object,type,times}=record;if(record.frame!==frame){record.kinematics.clear();record.frame=frame}let modified=this.cache.get(record);if(!modified){modified=colourNativeSystem(emitter,settings);this.cache.set(record,modified)}const source=original?emitter:modified,local=time-phaseStart(record.system.phase,this.data,this.distance),isCamera=/Camera(?:Unit)?Quad/.test(type),isRay=type==='VfxPrimitiveRay',points=[];let count=0;
   const assign=(at,sample,colour,spawn,seed)=>{const a=uvLayer(emitter,sample,spawn,seed),b=uvLayer(emitter,sample,spawn,seed,true),extra=surfaceValues(emitter,sample,seed);record.rgba.setXYZW(at,...colour);record.uv.setXYZW(at,...a.offset,...a.scale);record.uv2.setXYZW(at,...b.offset,...b.scale);record.turn.setXY(at,a.rotation,b.rotation);record.surface.setXYZW(at,extra.drive,...extra.lookup,sample.frame);record.paletteMix.setXYZW(at,...extra.mixer);record.paletteRow.setX(at,extra.row)};
   for(let i=0;i<times.length;i++){
    const seed=(record.index+1)*7919+(record.system.phase==='impact'?900000:record.system.phase==='cast'?500000:0)+i*997;let sample=record.kinematics.get(i);if(sample===undefined){sample=particleSample(emitter,times[i],local,seed,this.data,record.system.phase,this.distance);record.kinematics.set(i,sample)}if(!sample)continue;const colour=original||source===emitter?sample.rgba:particleRgba(source,times[i],local,seed);if(colour[3]<=.0001)continue;
    if(record.isRibbon){const tiling=sampleValue(emitter.primitive.mTrail?.mBirthTilingSize,times[i]/(emitter.lifetime||1),seed,[0,0,0]),start=phaseStart(record.system.phase,this.data,this.distance),born=phaseOrigin(record.system.phase,start+times[i],this.data,this.distance);points.push({position:sample.position,width:Math.abs(sample.size[0]),tiling,bornDistance:born[1],sample,colour,spawn:times[i],seed});continue}
    position.fromArray(sample.position);
    scale.fromArray(sample.size);
    if(type==='VfxPrimitiveBeam'||type==='VfxPrimitiveCameraSegmentBeam'){
     const beam=emitter.primitive?.mBeam;
     const sourceOffset=beam?.mLocalSpaceSourceOffset??[0,0,0],targetOffset=beam?.mLocalSpaceTargetOffset??[0,0,0];
     beamStart.fromArray(sourceOffset).add(position);
     beamEnd.fromArray(targetOffset).add(position);
     beamEnd.y+=this.distance;
     beamAxis.subVectors(beamEnd,beamStart);
     const length=beamAxis.length();
     if(length<.001||Math.abs(sample.size[0])<.001)continue;
     transform.position.addVectors(beamStart,beamEnd).multiplyScalar(.5);
     beamAxis.divideScalar(length);
     beamNormal.subVectors(this.camera.position,transform.position).normalize();
     beamWidth.crossVectors(beamAxis,beamNormal);
     if(beamWidth.lengthSq()<.000001)beamWidth.set(1,0,0).addScaledVector(beamAxis,-beamAxis.x);
     if(beamWidth.lengthSq()<.000001)beamWidth.set(0,0,1).addScaledVector(beamAxis,-beamAxis.z);
     beamWidth.normalize();
     beamNormal.crossVectors(beamWidth,beamAxis).normalize();
     transform.quaternion.setFromRotationMatrix(beamBasis.makeBasis(beamWidth,beamAxis,beamNormal));
     scale.set(sample.size[0]*.5,length*.5,1);
    }else{
     transform.position.copy(position);
     rotation.set(...sample.rotation.map(value=>value*Math.PI/180));
     transform.quaternion.setFromEuler(rotation);
     if(isCamera)transform.quaternion.premultiply(cameraRotation);
     if(isRay){scale.y=Math.max(1,Math.abs(sample.size[1]));transform.position.y+=scale.y;scale.z=1}
    }
    transform.scale.copy(scale);transform.updateMatrix();object.setMatrixAt(count,transform.matrix);assign(count,sample,colour,times[i],seed);count++;
   }
   if(record.isRibbon){const trail=emitter.primitive.mTrail??{},vertices=ribbonVertices(points,{camera:this.camera.position.toArray(),arbitrary:type==='VfxPrimitiveArbitraryTrail',mode:trail.mMode??0,smoothing:trail.mSmoothingMode??0,cutoff:trail.mCutoff??0}),positions=object.geometry.getAttribute('position'),coords=object.geometry.getAttribute('uv');for(const [at,vertex]of vertices.entries()){positions.setXYZ(at,...vertex.position);coords.setXY(at,...vertex.uv);const p=vertex.point;assign(at,p.sample,p.colour,p.spawn,p.seed)}object.geometry.setDrawRange(0,vertices.length);positions.needsUpdate=true;coords.needsUpdate=true}else{object.count=count;object.instanceMatrix.needsUpdate=true}
   for(const attribute of [record.rgba,record.uv,record.uv2,record.turn,record.surface,record.paletteMix,record.paletteRow])attribute.needsUpdate=true;for(const [name,variant]of Object.entries(record.variants))object.material.uniforms[name].value=!original&&variant.colourEditable?variant.changed:variant.original;
  }

  this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setViewport(x,0,width,height);this.renderer.setScissor(x,0,width,height);this.renderer.render(this.scene,this.camera);
 }
 render(){
  if(!this.active||!this.scene)return;const canvas=this.element.querySelector('.ability-canvas'),width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),size=this.renderer.getSize(new THREE.Vector2());if(size.x!==width||size.y!==height)this.renderer.setSize(width,height,false);this.renderer.setScissorTest(false);this.renderer.clear();this.renderer.setScissorTest(true);const split=this.comparison.checked;this.element.querySelector('.ability-comparison').hidden=!split;if(split){const half=Math.floor(width/2);this.renderPass(true,half,height,0);this.renderPass(false,width-half,height,half)}else this.renderPass(false,width,height,0);this.renderer.setScissorTest(false);this.timeline.value=String(this.time);this.element.querySelector('output').value=this.time.toFixed(2)+' s';this.element.querySelector('.ability-phase').textContent=this.data.preview?.beam?'Beam':this.data.preview?.stationary?'Effect':this.time<this.data.castTime?'Launch':this.time<this.data.castTime+flightDuration(this.data,this.distance)?'Flight':'Impact';
 }
}
