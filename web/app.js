import {CHAMPIONS,SKIN_NAMES} from './catalog-data.mjs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { METHOD, makeCache, recolorPixels, presetTargets } from './color-engine.mjs';
import { MATERIAL_METHOD, materialCache, materialPixels } from './material-engine.mjs';
import { availability } from './zone-availability.mjs';
import { SelectionOutline } from './selection-outline.mjs';
import { loadMaskData, validateMask } from './mask-data.mjs';
import { animatedMesh } from './animation-engine.mjs';
import { AnimationPlayer } from './animation-player.mjs';
import { EditHistory,paletteSnapshot } from './edit-history.mjs';
import { coordinatedPalette,paletteScheme } from './coordinated-palette.mjs';
import { composePaint } from './paint-engine.mjs';
import { SurfacePainter } from './surface-painter.mjs';
import {stateKey as skinStateKey,exportDesign} from './design-state.mjs';
import {createEditorTour} from './walkthrough.mjs';
import {assetUrl,loadJson} from './resource-cache.mjs';
import {attachSkinPrefetch} from './skin-prefetch.mjs';
import {materialOptions,configureMaterial,loadNativeMaterialAssets} from './native-material.mjs';
import {updateNativeMaterials} from './native-shaders.mjs';
import {applyNativeVisibility} from './native-visibility.mjs';
import {randomPartColours,paintRevertChanges} from './chroma-actions.mjs';
import {ModelEyedropper} from './model-eyedropper.mjs';
import {RectangleSelection} from './rectangle-selection.mjs';
import {FinishControls} from './finish-controls.mjs';
import {PartStudio} from './part-studio.mjs';
import {AbilityPreview} from './ability-preview.mjs';
import {migrateAbilityVfx} from './ability-colour.mjs';
import {partMaskPreview} from './part-finish.mjs';
import {semanticLabels} from './detail-colour.mjs';
import {ExportNameDialog} from './export-dialog.mjs';
import {customExportName,defaultExportName} from './export-name.mjs';
const $=id=>document.getElementById(id);
const visualCatalogLink=document.createElement('a');visualCatalogLink.className='choose-appearance';visualCatalogLink.href='pieces.html';visualCatalogLink.textContent='← All champions';document.querySelector('.library').prepend(visualCatalogLink);
const [manifest,catalogResult,visualArt,formsCatalog,animationCatalog]=await Promise.all([
 loadJson('./assets/manifest.json'),loadJson('./catalog/index.json').catch(()=>null),loadJson('./catalog/visual/index.json'),loadJson('./forms/index.json').catch(()=>({skins:{}})),loadJson('./animations/index.json').catch(()=>({skins:{}}))
]);
const catalogData=catalogResult??{skins:manifest.map(s=>({id:s.id,name:s.name,champion:s.champion,installed:true,prepared:true,status:s.automatic?'automatic':'reviewed',category:'skin'}))};
for(const skin of manifest)skin.name=SKIN_NAMES[skin.id];for(const row of catalogData.skins)row.name=SKIN_NAMES[row.id];for(const champion of catalogData.champions??[])champion.displayName=CHAMPIONS[champion.name]?.name??champion.name;
const skinArt=new Map(visualArt.champions.flatMap(champion=>champion.skins.map(skin=>[skin.id,skin.image])));
const rootSkins=new Map(),formSkins=new Map();
const animationElement=document.createElement('section');animationElement.className='animation-player';animationElement.setAttribute('aria-label','Animation player');$('viewport').appendChild(animationElement);const animationPlayer=new AnimationPlayer(animationElement);
const maskVariant=new URLSearchParams(location.search).get('mask');
const requestedRevision=new URLSearchParams(location.search).get('revision'),revisionSkin=location.hash.slice(1);
const samaIds=maskVariant==='sama'?new Set(await fetch('./experiments/amumu/summary.json').then(r=>r.json()).then(data=>(data.variants?.sama?.skins??[]).map(s=>s.id))):null;
const catalogRows=catalogData.skins.filter(row=>!samaIds||samaIds.has(row.id));
const variantSkins=new Map(),editorSkinButtons=new Map();
function paletteStorageKey(s){return 'atelier-'+skinStateKey(s)}
function championLabel(name){return catalogData.champions?.find(c=>c.name===name)?.displayName??name}
function marksman(name){return catalogData.champions?.some(c=>c.name===name&&c.group==='marksman')}
$('champion-filter').replaceChildren();for(const champion of [{name:'',displayName:'All champions'},...(catalogData.champions??[]).slice().sort((a,b)=>championLabel(a.name).localeCompare(championLabel(b.name)))]){const option=document.createElement('option');option.value=champion.name;option.textContent=champion.displayName??champion.name;$('champion-filter').appendChild(option)}
const initialCatalogRow=catalogRows.find(r=>r.id===location.hash.slice(1));if(initialCatalogRow)$('champion-filter').value=initialCatalogRow.champion;$('adc-only').checked=false;
if(maskVariant==='sama'){$('adc-only').checked=false;$('adc-only').disabled=true;document.querySelector('.library .intro').textContent='Experimental selection'}
if(maskVariant==='mesh'){$('adc-only').checked=false;document.querySelector('.library .intro').textContent='Parts';$('quality-filter').innerHTML='<option value="">All parts</option><option value="mesh_ready">Ready</option><option value="mesh_pending">Pending</option><option value="mesh_failed">Unavailable</option>'}
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(34,1,.1,10000);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);
$('scene').appendChild(renderer.domElement);
const selectionOutline=new SelectionOutline(renderer);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.autoRotateSpeed=.55;controls.maxPolarAngle=Math.PI*.91;
const root=new THREE.Group();scene.add(root);
const grid=new THREE.GridHelper(8,32,0x4a4a50,0x2e2e34);grid.material.transparent=true;grid.material.opacity=.17;scene.add(grid);
const ring=new THREE.Mesh(new THREE.RingGeometry(1.38,1.385,128),new THREE.MeshBasicMaterial({color:0x77777e,transparent:true,opacity:.3,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.002;scene.add(ring);
let current,state,mesh,textureRecords=[],compare=false,loadId=0,dirty=false,selected=0,saveTimer,editZones=false,showZones=false,prepareTicket=0,exporting=false;
let splitView=false,painter,walkthrough,nativeMaterialAssets,rectangleSelector,finishControls,partStudio,abilityPreview;let partMaskVisible=false;
let selectedCatalogId=location.hash.slice(1);
const zoneColors=['#e0b752','#5ea5d1','#b875aa','#77c3a2','#e3aa82','#8478d1','#6dd2d9','#bc9165','#c2c89c'];
function zoneColor(index){return current?.nativeParts?'#'+new THREE.Color().setHSL((index*.61803398875)%1,.52,.61).getHexString():zoneColors[index%zoneColors.length]}
const states=new Map(),histories=new WeakMap();
function editHistory(owner=state){if(!owner)return null;if(!histories.has(owner))histories.set(owner,new EditHistory({onChange:()=>{if(state===owner)updateHistoryButtons()}}));return histories.get(owner)}
function updateHistoryButtons(){$('undo').disabled=!editHistory()?.canUndo;$('redo').disabled=!editHistory()?.canRedo}
function restorePalette(owner,snapshot){Object.assign(owner,structuredClone(snapshot));if(owner===state){$('energy').value=state.energy;$('effects').checked=state.effects;colorsUI();finishControls?.sync(current,state,mesh?.userData.finishState);partStudio?.sync();abilityPreview?.sync();dirty=true}}
function rememberPalette(before,key=null){const owner=state,after=paletteSnapshot(owner);if(JSON.stringify(before)===JSON.stringify(after))return;editHistory(owner).push({key,bytes:(before.targets.length+after.targets.length)*8,undo:()=>restorePalette(owner,before),redo:()=>restorePalette(owner,after)});walkthrough?.notify('colour')}
function editPalette(action,key=null){if(!state)return;const before=paletteSnapshot(state);action();rememberPalette(before,key)}
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const hex=c=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').classList.add('visible');clearTimeout(saveTimer);saveTimer=setTimeout(()=>$('toast').classList.remove('visible'),error?12000:6500)}
function anchorsFrom(image){const c=document.createElement('canvas');c.width=96;c.height=96;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,96,96);const a=ctx.getImageData(0,0,96,96).data,p=[];for(let i=0;i<a.length;i+=4)if(a[i+3]>128&&Math.max(a[i],a[i+1],a[i+2])>14)p.push([a[i]/255,a[i+1]/255,a[i+2]/255]);const anchors=[p[Math.floor(p.length/2)]];while(anchors.length<7){let best=-1,point=p[0];for(const c of p){const d=Math.min(...anchors.map(a=>c.reduce((s,v,i)=>s+(v-a[i])**2,0)));if(d>best){best=d;point=c}}anchors.push(point.slice())}for(let k=0;k<14;k++){const sums=anchors.map(()=>[0,0,0,0]);for(const c of p){let best=0,d=1e9;anchors.forEach((a,i)=>{const n=c.reduce((s,v,k)=>s+(v-a[k])**2,0);if(n<d){d=n;best=i}});c.forEach((v,i)=>sums[best][i]+=v);sums[best][3]++}sums.forEach((s,i)=>{if(s[3])anchors[i]=s.slice(0,3).map(v=>v/s[3])})}return anchors.sort((a,b)=>Math.max(...b)-Math.max(...a)).map(hex)}
function colorName(h){const c=rgb(h),max=Math.max(...c),min=Math.min(...c),d=max-min;if(d<.08)return max>.7?'Pearl':max>.35?'Grey':'Shadow';let hue=max===c[0]?((c[1]-c[2])/d)%6:max===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4;hue=(hue*60+360)%360;return hue<20||hue>=345?'Crimson':hue<50?'Copper':hue<75?'Gold':hue<165?'Jade':hue<200?'Cyan':hue<260?'Blue':hue<300?'Violet':'Pink'}
function record(image,meta,maskPixels=null,zonesConfig=current.zones,skin=current,owner=state){
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const original=new Uint8ClampedArray(image.pixels),pixels={data:new Uint8ClampedArray(original)},cache=maskPixels?materialCache(original,maskPixels,zonesConfig):makeCache(original,owner.anchors),texture=new THREE.DataTexture(pixels.data,image.width,image.height,THREE.RGBAFormat,THREE.UnsignedByteType);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();const atlas=skin.previewAtlases?.[meta.id];if(atlas)texture.repeat.set(1/atlas.columns,1/atlas.rows);texture.needsUpdate=true;const originalTexture=texture.clone();originalTexture.source=new THREE.Source({data:original,width:image.width,height:image.height});originalTexture.needsUpdate=true;owner.paintLayers??=new Map();return{canvas,pixels,original,cache,labels:cache.labels,texture,originalTexture,meta,atlas,paintLayer:owner.paintLayers.get(meta.id)};
}
function repaint(){
 if(!state)return;
 for(const r of textureRecords){
  let pixels;
  if(compare)pixels=r.original;
  else if(partMaskVisible&&state.selectionConfirmed)pixels=partMaskPreview(r.original,r.cache.labels,state.selection??[],state.partFinishes);
  else if(showZones){pixels=new Uint8ClampedArray(r.original);for(let p=0;p<r.cache.labels.length;p++){const label=r.cache.labels[p];if(label>=state.anchors.length)continue;const color=rgb(current.nativeParts&&state.selection?.includes(label)?'#eeeeef':zoneColor(label));for(let k=0;k<3;k++)pixels[p*4+k]=Math.round(r.original[p*4+k]*.3+color[k]*255*.7)}}
  else pixels=r.cache.method===MATERIAL_METHOD?materialPixels(r.original,state.targets,r.cache,{colourMode:state.colourMode??'preserve',finish:state.finish,texture:r.meta.finish,partFinishes:state.partFinishes}):recolorPixels(r.original,state.anchors,state.targets,r.cache);
  if(!compare&&!showZones&&r.paintLayer)pixels=composePaint(pixels,r.paintLayer,r.canvas.width,r.canvas.height);
  r.pixels.data.set(pixels);r.texture.needsUpdate=true;
 }
 dirty=false;
}
function applyAssignments(r,owner=state){
 if(!r.islands)return;r.cache.labels.set(r.nativeLabels);const assignments=owner.zoneAssignments?.[r.meta.id]??{};
 for(let p=0;p<r.islands.length;p++){const role=Number(assignments[r.islands[p]]);if(role>=1&&role<=owner.anchors.length)r.cache.labels[p]=role-1}
}
function restoreAssignments(){for(const r of textureRecords)applyAssignments(r);refreshZoneAvailability();dirty=true}
function animatedBounds(object){const bounds=new THREE.Box3(),point=new THREE.Vector3(),index=object.geometry.index.array,rest=object.userData.visibleBounds,center=rest.getCenter(new THREE.Vector3()),radius=Math.max(.001,rest.getSize(new THREE.Vector3()).length())*5;object.updateMatrixWorld(true);for(const group of object.geometry.groups){if(!object.material[group.materialIndex].visible)continue;for(let i=group.start;i<group.start+group.count;i++){object.getVertexPosition(index[i],point);if(point.distanceTo(center)<radius)bounds.expandByPoint(point)}}return bounds.isEmpty()?rest.clone():bounds}
function modelBounds(object){object.updateMatrixWorld(true);const bounds=object.userData.animationBounds??object.userData.visibleBounds;return bounds?bounds.clone().applyMatrix4(object.matrixWorld):new THREE.Box3().setFromObject(object)}
animationPlayer.captureBounds=animatedBounds;
animationPlayer.onFrame=()=>{if(!mesh)return;applyNativeVisibility(mesh,current,animationPlayer.select.value);if(mesh.userData.nativeVisibilityDirty){prepareVisiblePixels(mesh);refreshZoneAvailability();mesh.userData.nativeVisibilityDirty=false}mesh.rotation.y=!animationPlayer.sequence.length?(current.previewRotationY??(current.champion==='Sona'?Math.PI:0)):0;const rig=mesh.userData.animationRig,rest=mesh.userData.visibleBounds,bounds=mesh.userData.animationBounds,root=rig?.bones.find(bone=>bone.parent===-1&&/^root$/i.test(bone.name))??rig?.bones.find(bone=>bone.parent===-1);mesh.userData.followRoot=root?mesh.userData.animationBones.get(root.hash):null;mesh.userData.followMotion=!!(bounds&&root&&bounds.getSize(new THREE.Vector3()).length()>rest.getSize(new THREE.Vector3()).length()*1.8);if(mesh.userData.followMotion)mesh.userData.animationBounds=rest.clone().translate(mesh.userData.followRoot.position.clone().sub(new THREE.Vector3().fromArray(root.position)));frame();if(mesh.userData.followRoot){mesh.userData.previousRootLocal=mesh.userData.followRoot.position.clone();mesh.userData.previousRootWorld=mesh.userData.followRoot.getWorldPosition(new THREE.Vector3())}};
animationPlayer.onPose=object=>{applyNativeVisibility(object,current,animationPlayer.select.value);const data=object.userData;if(!data.followMotion||!data.followRoot||!data.previousRootWorld)return;const world=data.followRoot.getWorldPosition(new THREE.Vector3()),delta=world.clone().sub(data.previousRootWorld);camera.position.add(delta);controls.target.add(delta);data.animationBounds.translate(data.followRoot.position.clone().sub(data.previousRootLocal));data.previousRootLocal.copy(data.followRoot.position);data.previousRootWorld.copy(world)};
function isHiddenGroup(s,name){return s.automatic?(s.hiddenSubmeshes??[]).includes(name.toLowerCase())||/smear|trail|recall|flute|instrument/i.test(name):/smear|vfx|dragon|flute|recallweapon|instrument/i.test(name)}
function updatePreparationStatus(s){
 $('viewport').classList.remove('sama-mode');document.querySelector('.palette').classList.toggle('mesh-parts-mode',!!s.nativeParts);$('mesh-tools').hidden=!s.nativeParts;$('mask-status').replaceChildren();$('mask-status').hidden=true;$('sama-zones').hidden=!s.nativeParts;$('sama-zones').textContent='Show parts';$('authoring-link').hidden=true;$('zone-editor').hidden=true;
}
function refreshZoneAvailability(){
 if(!current||!state)return;const report=availability(textureRecords,current);state.zoneAvailability=report;if(current.nativeParts&&(!state.selectionConfirmed||state.selection?.length)&&!(state.selection??[0]).some(index=>report[index]?.visible>0)){const visible=report.findIndex(zone=>zone.visible>0);if(visible>=0){state.selection=[visible];selected=visible;selectionOutline.setSelection(state.selection)}}
 document.querySelectorAll('.color-row').forEach((row,i)=>{const zone=report[i],empty=!zone||zone.state==='empty';row.classList.toggle('unassigned',empty);row.dataset.zoneState=zone?.state??'empty';row.querySelectorAll('input').forEach(input=>input.disabled=empty);const note=row.querySelector('.zone-note');note.textContent=empty?'Unassigned':zone.state==='other_view'?'Not used by the visible parts.':zone.state==='small'?'Small detail: zoom in to inspect.':'';row.title=note.textContent});
 const active=report.filter(r=>r.visible>0).length,assigned=report.filter(r=>r.total>0).length;const summary=$('availability-summary');summary.textContent=!assigned?'No editable parts.':active+' of '+report.length+' controls affect the current form.'+(assigned<report.length?' '+(report.length-assigned)+' unassigned.':'');summary.classList.toggle('empty',!assigned);$('randomize').disabled=!assigned;
}
function prepareVisiblePixels(object){
 const geometry=object.geometry,index=geometry.index.array,uv=geometry.getAttribute('uv');
 for(const record of textureRecords){const canvas=document.createElement('canvas');canvas.width=record.canvas.width;canvas.height=record.canvas.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';
  for(const group of geometry.groups){const material=object.material[group.materialIndex];if(!material.visible||material.map!==record.texture)continue;
   for(let i=group.start;i<group.start+group.count;i+=3){const vertices=[index[i],index[i+1],index[i+2]],us=vertices.map(v=>uv.getX(v)),vs=vertices.map(v=>uv.getY(v));for(let u=Math.floor(Math.min(...us));u<=Math.floor(Math.max(...us));u++)for(let v=Math.floor(Math.min(...vs));v<=Math.floor(Math.max(...vs));v++){context.beginPath();context.moveTo((us[0]-u)*canvas.width,(vs[0]-v)*canvas.height);context.lineTo((us[1]-u)*canvas.width,(vs[1]-v)*canvas.height);context.lineTo((us[2]-u)*canvas.width,(vs[2]-v)*canvas.height);context.closePath();context.fill()}}
  }
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;record.visiblePixels=new Uint8Array(record.cache.labels.length);for(let p=0;p<record.visiblePixels.length;p++)record.visiblePixels[p]=pixels[p*4+3]>127?1:0;
 }
}
function colorsUI(){
 const list=$('colors');list.innerHTML='';state.anchors.forEach((color,i)=>{const row=document.createElement('div');row.className='color-row';row.dataset.index=i;row.innerHTML=`<div class="color-well"><input type="color" aria-label="Colour ${i+1}" value="${state.targets[i]}"></div><label><i class="zone-dot" style="background:${zoneColor(i)}"></i>${state.labels?.[i]??colorName(color)} <span style="opacity:.4;font-size:9px">${String(i+1).padStart(2,'0')}</span><span class="original-mini"><i style="background:${color}"></i> ORIGINAL</span><span class="zone-note"></span></label><input class="hex" aria-label="Hex code ${i+1}" value="${state.targets[i].toUpperCase()}" maxlength="7">`;
  const picker=row.querySelector('[type=color]'),input=row.querySelector('.hex');for(const field of [picker,input])field.addEventListener('focus',()=>{if(current?.nativeParts&&(!state.selectionConfirmed||!state.selection?.includes(i))){state.selection=[i];state.selectionConfirmed=true;updateMeshSelection();dirty=true}});picker.addEventListener('input',()=>{setTarget(i,picker.value);input.value=picker.value.toUpperCase()});input.addEventListener('input',()=>{if(/^#[0-9a-f]{6}$/i.test(input.value)){setTarget(i,input.value);picker.value=input.value}});input.addEventListener('change',()=>{if(/^#[0-9a-f]{6}$/i.test(input.value)){setTarget(i,input.value);picker.value=input.value}else input.value=state.targets[i].toUpperCase()});row.querySelector('.original-mini').addEventListener('click',()=>{const before=paletteSnapshot(state);for(const index of current.nativeParts&&state.selection?.includes(i)?state.selection:[i])state.targets[index]=state.anchors[index];colorsUI();dirty=true;rememberPalette(before)});for(const field of [picker,input])field.addEventListener('change',()=>editHistory()?.seal());list.appendChild(row)
 });refreshZoneAvailability();updateMeshSelection();
}
function updateMeshSelection(){
 partStudio?.sync();
 $('pick-colour').disabled=!state?.selectionConfirmed||!state.selection?.length||!$('loading').classList.contains('hidden');
 $('revert-selection').disabled=!state?.selectionConfirmed||!state.selection?.length||!$('loading').classList.contains('hidden');
 if(!current?.nativeParts)return;
 state.selection=(state.selection??[0]).filter(i=>Number.isInteger(i)&&i>=0&&i<state.anchors.length);if(!state.selection.length&&!state.selectionConfirmed)state.selection=[0];selected=state.selection.at(-1)??-1;
 document.querySelectorAll('.color-row').forEach((row,i)=>row.classList.toggle('selected',state.selectionConfirmed&&i===selected));const part=current.nativeParts.groups[selected];$('mesh-selection-note').textContent=!state.selectionConfirmed||!state.selection.length?'No parts selected.':state.selection.length>1?state.selection.length+' groups selected.':part.components>1?'This selection includes '+part.components+' linked parts.':'One part selected.';
 selectionOutline.setSelection(state.selection.flatMap(index=>{const control=[...(current.materialControls??[]),...(current.materialTextureControls??[])].find(item=>item.zone===index);if(!control)return index;if(control.selectionRoles)return control.selectionRoles;const policy=current.previewMaterials[control.groups[0]];return Object.values(policy.colourZones??policy.textureZones)[0]}));
}
function setTarget(index,color){
 const before=paletteSnapshot(state);const indices=current?.nativeParts&&state.selection?.includes(index)?state.selection:[index];for(const i of indices){state.targets[i]=color.toLowerCase();const row=document.querySelector('.color-row[data-index="'+i+'"]');if(row){row.querySelector('[type=color]').value=color;const input=row.querySelector('.hex');if(document.activeElement!==input)input.value=color.toUpperCase()}}dirty=true;rememberPalette(before,'colour-'+index);
}
function frame(top=false,preserveDirection=false){
 if(!mesh)return;const box=modelBounds(mesh),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),height=size.y,rect=$('scene').getBoundingClientRect();camera.aspect=Math.max(.1,rect.width/(splitView?2:1)/Math.max(1,rect.height));camera.updateProjectionMatrix();
 const direction=(preserveDirection?camera.position.clone().sub(controls.target):top?new THREE.Vector3(.9,1.8,1.5):new THREE.Vector3(.1,.15,2.3)).normalize(),right=new THREE.Vector3().crossVectors(direction,camera.up).normalize(),up=new THREE.Vector3().crossVectors(right,direction).normalize(),tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;
 let distance=0;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const point=new THREE.Vector3(x,y,z).sub(center),depth=point.dot(direction);distance=Math.max(distance,Math.abs(point.dot(right))/tanX+depth,Math.abs(point.dot(up))/tanY+depth)}
 controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance*1.12);controls.minDistance=height*.5;controls.maxDistance=Math.max(height*6,distance*3);controls.update();
}
async function imageLoad(url){return loadMaskData(url)}
async function loadTextureRecord(s,base,meta,providedImage=null,owner=state){
 const url=path=>assetUrl(base+path,s.nativeParts?.revision),config=s.zones?.textures?.[meta.id]??(meta.id===s.defaultTexture&&s.zones?{mask:s.zones.mask,profiles:s.zones.profiles}:null);
 if(s.zones&&!config)throw Error('The texture mask is missing.');
 const [image,mask,island]=await Promise.all([providedImage??imageLoad(url(meta.previewImage??meta.id+'.png')),config?loadMaskData(url(config.mask)):null,config?.islands?loadMaskData(url(config.islands)):null]);
 const pixels=mask?validateMask(mask,image.width,image.height,config.maskEncoding,s.zones.anchors.length):null;
 if(island&&(island.width!==image.width||island.height!==image.height))throw Error('Part data does not match the texture size.');
 if(meta.finish?.semantic){const semantic=meta.finish.semantic,data=await loadMaskData(assetUrl('./'+semantic.mask,s.nativeParts?.revision));validateMask(data,image.width,image.height,semantic.maskEncoding,semantic.channelIds.length);meta={...meta,finish:{...meta.finish,semantic:{...semantic,labels:semanticLabels(data.pixels,semantic.maskEncoding,semantic.channelIds.length)}}}}
 const result=record(image,meta,pixels,config?{...s.zones,profiles:config.profiles,maskEncoding:config.maskEncoding}:s.zones,s,owner);result.nativeLabels=new Uint32Array(result.cache.labels);
 if(island){const data=island.pixels;result.islands=new Uint32Array(image.width*image.height);for(let p=0;p<result.islands.length;p++)result.islands[p]=data[p*4]+(data[p*4+1]<<8)+(data[p*4+2]<<16);result.pieces=new Map(config.pieces.map(piece=>[piece.id,piece]));applyAssignments(result,owner)}
 return result;
}
function availableDesigns(s){return s.designs?.length?s.designs:[{id:'material-original',name:s.preset,targets:s.zones?.preset,description:'Original'}]}
function activeDesign(){return availableDesigns(current).find(d=>d.id===state.design)??availableDesigns(current)[0]}
function designOptions(s){const options=availableDesigns(s);if(!options.some(d=>d.id===state.design))state.design=s.defaultDesign??options[0].id;const select=$('design');select.replaceChildren();for(const design of options){const option=document.createElement('option');option.value=design.id;option.textContent=design.name;select.appendChild(option)}select.value=state.design;const design=activeDesign();$('preset').querySelector('span').textContent=design.name;$('design-description').textContent=design.description??''}
async function selectSkin(s){
 eyedropper?.cancel();partStudio?.clearPreview();abilityPreview?.setSkin(null);
 if(s.previewForms)formsCatalog.skins[s.id]=s.previewForms;
 const fullDesigns=s.fullMaterials?s.designs:null;
 s={...s,name:SKIN_NAMES[s.id],preset:'Original',zones:{...s.zones,labels:s.zones.anchors.map((_,index)=>s.nativeParts.groups[index]?.materialParameter?s.zones.labels[index]:'Part '+String(index+1).padStart(2,'0'))},designs:[{id:s.defaultDesign??'material-original',name:'Original',targets:s.zones.anchors.slice(),description:''}]};
 if(fullDesigns)s.designs=fullDesigns;
 if(!s.formContext&&!rootSkins.has(s.id))rootSkins.set(s.id,s);
 const formDefinition=formsCatalog.skins[s.id];const formId=s.formContext??s.formId??formDefinition?.default??'base';const formSelect=$('form-select');formSelect.replaceChildren();for(const option of formDefinition?.options??[])formSelect.add(new Option(option.label,option.id));formSelect.value=formId;formSelect.parentElement.hidden=!formDefinition;
 const editorUrl=new URL(location.href);editorUrl.hash=s.id;history.replaceState(null,'',editorUrl);
 visualCatalogLink.href='pieces.html?champion='+encodeURIComponent(s.champion);
 painter?.setMode('select');animationPlayer.clear();const ticket=++loadId;document.querySelectorAll('#colors input').forEach(input=>input.disabled=true);selectedCatalogId=s.id;renderCatalog();$('loading').textContent='Loading model…';$('loading').classList.remove('hidden');$('export').disabled=true;$('randomize').disabled=true;$('design').disabled=true;$('revert-selection').disabled=true;current=s;
 document.querySelectorAll('.skin-btn').forEach(b=>b.classList.toggle('active',b.dataset.id===s.id));$('champion').textContent=championLabel(s.champion).toUpperCase();$('skin-title').textContent=s.name;$('preset').querySelector('span').textContent=s.preset;
 try{
  const started=performance.now(),base='./'+(s.assetBase??('assets/'+s.id+'/')),url=path=>assetUrl(base+path,s.nativeParts?.revision),mainMeta=s.textures.find(t=>t.id===s.defaultTexture),mainConfig=s.zones.textures?.[s.defaultTexture]??{mask:s.zones.mask};
  const animationManifest=s.activeAnimation??formDefinition?.options.find(option=>option.id===formId)?.animation??animationCatalog.skins[s.id];
  const [data,mainImage,triangleRoles,rigResult]=await Promise.all([loadJson(url(s.defaultMesh+'.json')),imageLoad(url(mainMeta.previewImage??s.defaultTexture+'.png')),s.nativeParts?loadJson(url(s.nativeParts.triangleRoles)):null,animationManifest?.rig?loadJson('./'+animationManifest.rig).then(rig=>({rig})).catch(error=>({error})):null,mainConfig.mask?loadMaskData(url(mainConfig.mask)):null]);if(ticket!==loadId)return;
  const rig=rigResult?.rig??null;if(rigResult?.error)toast('Animations unavailable: '+rigResult.error.message,true);
  if(!states.has(skinStateKey(s))){
   const anchors=s.zones?s.zones.anchors.slice():anchorsFrom(mainImage),designs=availableDesigns(s),design=designs.find(d=>d.id===new URLSearchParams(location.search).get('design'))??designs.find(d=>d.id===s.defaultDesign)??designs[0];
   states.set(skinStateKey(s),{anchors,targets:s.zones?design.targets.slice():anchors.slice(),labels:s.zones?.labels,method:s.zones?MATERIAL_METHOD:METHOD,design:design.id,paletteName:design.name,energy:s.zones?design.targets[energyIndex(s.zones)]:s.palette[2],effects:false,zoneAssignments:{},colourMode:'preserve',finish:design.finish?structuredClone(design.finish):null});
  }
  state=states.get(skinStateKey(s));state.labels=s.zones.labels;state.zoneAssignments??={};state.colourMode??='preserve';designOptions(s);finishControls?.sync(s,state);$('effects').closest('.effects').hidden=!!s.abilityVfx||!!s.fullMaterials&&s.fullMaterials.effectCoverage!=='model_only';abilityPreview?.setSkin(s);updatePreparationStatus(s);$('palette-count').textContent=String(state.anchors.length);
  rectangleSelector?.reset();selectionOutline.clear();nativeMaterialAssets?.dispose();nativeMaterialAssets=null;for(const r of textureRecords){r.texture.dispose();r.originalTexture?.dispose()}textureRecords=[];
  while(root.children.length){const old=root.children[0];root.remove(old);old.geometry?.dispose();old.skeleton?.dispose();if(Array.isArray(old.material))old.material.forEach(m=>m.dispose())}
  const owner=state,metas=new Map([[s.defaultTexture,mainMeta]]);
  for(const group of data.groups){
   if(isHiddenGroup(s,group.name)&&!s.loadAllTextures)continue;
   const textureId=s.previewTextureOverrides?.[group.name];if(!textureId||metas.has(textureId))continue;
   const meta=s.textures.find(t=>t.id===textureId);if(!meta)throw Error('An original material texture is missing.');
   metas.set(textureId,meta);
  }
  for(const policy of Object.values(s.previewMaterials??{}))for(const sampler of Object.values(policy.samplers??{})){const meta=s.textures.find(item=>item.id===sampler.texture);if(meta&&!metas.has(meta.id))metas.set(meta.id,meta)}
  const loaded=await Promise.allSettled([...metas.values()].map(meta=>loadTextureRecord(s,base,meta,meta.id===s.defaultTexture?mainImage:null,owner))),records=loaded.filter(result=>result.status==='fulfilled').map(result=>result.value),failed=loaded.find(result=>result.status==='rejected');
  if(ticket!==loadId||failed){for(const record of records){record.texture.dispose();record.originalTexture.dispose()}if(failed)throw failed.reason;return}
  const nativeAssets=await loadNativeMaterialAssets(THREE,s,base,records);if(ticket!==loadId){nativeAssets.dispose();for(const record of records){record.texture.dispose();record.originalTexture.dispose()}return}nativeMaterialAssets=nativeAssets;textureRecords=records;const materialRecords=new Map(records.map(record=>[record.meta.id,record])),mainRecord=materialRecords.get(s.defaultTexture);
  if(triangleRoles&&triangleRoles.length!==data.indices.length/3)throw Error('Part data does not match the model.');
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions.flat(),3));if(data.normals?.flat().length===data.positions.flat().length)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals.flat(),3));else geometry.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(data.positions.flat().length),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs.flat(),2));geometry.setIndex(data.indices);if(!data.normals?.length)geometry.computeVertexNormals();
  const mats=data.groups.map((g,i)=>{const hidden=isHiddenGroup(s,g.name);const policy={alphaTest:s.previewOpaqueGroups?.includes(g.name)?0:.25,...s.previewMaterials?.[g.name]},mat=configureMaterial(THREE,new THREE.MeshBasicMaterial({...materialOptions(THREE,policy,(materialRecords.get(s.previewTextureOverrides?.[g.name])??mainRecord).texture),visible:!hidden}),policy,nativeMaterialAssets.groups.get(g.name));geometry.addGroup(g.start,g.count,i);return mat});
  try{mesh=rig?animatedMesh(THREE,geometry,mats,rig):new THREE.Mesh(geometry,mats)}catch(error){mesh=new THREE.Mesh(geometry,mats);toast('Animations unavailable: '+error.message,true)}
  mesh.rotation.y=s.previewRotationY??(s.champion==='Sona'?Math.PI:0);mesh.userData.nativeTriangleRoles=triangleRoles;mesh.userData.nativeGroups=data.groups;selectionOutline.setMesh(mesh,triangleRoles);selectionOutline.setSelection(state.selection??[0]);root.add(mesh);geometry.computeBoundingBox();const bounds=new THREE.Box3(),point=new THREE.Vector3(),position=geometry.getAttribute('position');for(const group of geometry.groups){if(!mats[group.materialIndex].visible)continue;for(let i=group.start;i<group.start+group.count;i++){point.fromBufferAttribute(position,geometry.index.array[i]);bounds.expandByPoint(point)}}mesh.userData.visibleBounds=bounds;prepareVisiblePixels(mesh);const size=bounds.getSize(new THREE.Vector3());mesh.scale.setScalar(2.8/Math.max(.01,size.y));let box=modelBounds(mesh);mesh.position.y=-box.min.y;mesh.position.x=-(box.max.x+box.min.x)/2;frame();
  $('energy').value=state.energy;$('effects').checked=state.effects;colorsUI();repaint();$('loading').classList.add('hidden');for(const id of ['save','restore','reset','preset','sama-zones','mesh-show-all'])$(id).disabled=false;updateMeshSelection();$('export').disabled=exporting||exportBlocked(s);refreshZoneAvailability();$('design').disabled=false;updateHistoryButtons();
  window.atelier={manifest,current:s,state,scene,renderer,mesh,textureRecords,selectSkin,exportPalette,applyPreset,repaint,animationPlayer,painter,abilityPreview,undo:()=>editHistory()?.undo(),redo:()=>editHistory()?.redo()};
  $('scene').dataset.loadMs=String(Math.round(performance.now()-started));animationPlayer.load(mesh,animationManifest);walkthrough?.ready();
 }catch(e){if(ticket!==loadId)return;$('loading').textContent='Could not load the model: '+e.message;toast(e.message,true)}
}
function energyIndex(zones){if(!zones?.roles)return 4;const index=zones.roles.findLastIndex(r=>r.kind==='glow');return index>=0?index:zones.anchors.length-1}
function applyPreset(){state.design=$('design').value;const design=activeDesign();state.finish=design.finish?structuredClone(design.finish):null;state.partFinishes={};finishControls?.sync(current,state,mesh?.userData.finishState);state.paletteName=design.name;$('preset').querySelector('span').textContent=design.name;$('design-description').textContent=design.description??'';state.targets=current.zones?design.targets.slice():presetTargets(state.anchors,current);state.energy=current.zones?state.targets[energyIndex(current.zones)]:current.palette[2];state.effects=!current.zones;$('energy').value=state.energy;$('effects').checked=state.effects;colorsUI();dirty=true}
function revertColours(selection=null){
 if(!state||selection&&!state.selectionConfirmed)return;painter?.cancel();const owner=state,before=paletteSnapshot(owner),changes=paintRevertChanges(textureRecords,selection);
 if(selection){for(const index of selection){owner.targets[index]=owner.anchors[index];delete owner.partFinishes?.[index]}if(owner.finish)owner.finish.exemptZones=[...new Set([...(owner.finish.exemptZones??[]),...selection])]}else{owner.paletteName='Original';owner.targets=owner.anchors.slice();owner.effects=false;owner.finish=null;owner.partFinishes={};owner.abilityVfx={}}
 const after=paletteSnapshot(owner),apply=(palette,field)=>{for(const change of changes)change.layer.applyChange(change.indices,change[field]);restorePalette(owner,palette)};apply(after,'after');
 if(changes.length||JSON.stringify(before)!==JSON.stringify(after))editHistory(owner).push({bytes:changes.reduce((sum,change)=>sum+change.indices.byteLength*3,0)+(before.targets.length+after.targets.length)*8,undo:()=>apply(before,'before'),redo:()=>apply(after,'after')});
}
function randomizeColors(){if(!state)return;state.paletteName='Random chroma';const colours=randomPartColours(state.anchors);state.targets=colours.map((colour,index)=>current.zones.roles[index]?.randomize===false?state.anchors[index]:colour);state.energy=state.targets[energyIndex(current.zones)];$('energy').value=state.energy;colorsUI();dirty=true}
function exportBlocked(s){return !s?.exportPolicy?.canExport}
function downloadFile(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
async function exportPalette(name){
 if(exporting||exportBlocked(current))return;
 const {skin,palette:payload,descriptorPath}=exportDesign(current,rootSkins,states,formsCatalog.skins[current.id],formSkins);
 const customName=customExportName(name);
 if(customName)payload.exportName=customName;
 exporting=true;$('export').disabled=true;$('export').textContent='Preparing .fantome…';let worker;
 try{
  const heldCompare=compare,heldZones=showZones,heldPartMask=partMaskVisible;compare=false;showZones=false;partMaskVisible=false;repaint();drawEditor(false);const sourceCanvas=renderer.domElement,thumbnailCanvas=document.createElement('canvas'),logicalSize=renderer.getSize(new THREE.Vector2()),start=splitView?Math.round(Math.floor(logicalSize.x/2)*renderer.getPixelRatio()):0;thumbnailCanvas.width=sourceCanvas.width-start;thumbnailCanvas.height=sourceCanvas.height;thumbnailCanvas.getContext('2d').drawImage(sourceCanvas,start,0,thumbnailCanvas.width,thumbnailCanvas.height,0,0,thumbnailCanvas.width,thumbnailCanvas.height);compare=heldCompare;showZones=heldZones;partMaskVisible=heldPartMask;dirty=true;
  const thumbnailBlob=await new Promise(resolve=>thumbnailCanvas.toBlob(resolve,'image/png'));
  if(!thumbnailBlob||!thumbnailBlob.size)throw Error('Could not capture the thumbnail. Please try again.');
  const thumbnail=await thumbnailBlob.arrayBuffer();
  worker=new Worker(new URL('./fantome-worker.mjs?rev=12',import.meta.url),{type:'module'});
  const result=await new Promise((resolve,reject)=>{worker.onmessage=event=>{if(event.data.progress){$('export').textContent=event.data.progress;return}if(event.data.error)reject(Error(event.data.error));else resolve(event.data)};worker.onerror=()=>reject(Error('Could not start the exporter. Reload and try again.'));worker.postMessage({skin:skin.id,descriptorPath,palette:payload,thumbnail})});
  downloadFile(new Blob([result.data],{type:'application/octet-stream'}),result.filename);toast('.fantome downloaded. Select the original skin in game.');return result;
 }catch(error){toast(error.message,true);throw error}finally{worker?.terminate();exporting=false;$('export').disabled=exportBlocked(current);$('export').innerHTML='Download .fantome <span>↗</span>'}
}

function normalized(value){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function renderCatalog(){
 const champion=$('champion-filter').value,query=normalized($('skin-search').value);
 const rows=catalogRows.filter(row=>(!champion||row.champion===champion)&&row.category!=='chroma'&&normalized((SKIN_NAMES[row.id]??'')+' '+(CHAMPIONS[row.champion]?.name??row.champion)).includes(query));
 $('catalog-count').textContent=String(rows.length);$('skins').replaceChildren();
 const fragment=document.createDocumentFragment();for(const [index,row] of rows.entries()){
  let button=editorSkinButtons.get(row.id);if(!button){button=document.createElement('button');button.dataset.id=row.id;button.setAttribute('aria-label','Edit '+SKIN_NAMES[row.id]);const art=document.createElement('img');art.alt='';art.loading=index<3?'eager':'lazy';art.decoding='async';art.src=skinArt.get(row.id);const title=document.createElement('strong');title.textContent=SKIN_NAMES[row.id];button.append(art,title);button.onclick=()=>requestSkin(row);attachSkinPrefetch(button,row.id);editorSkinButtons.set(row.id,button)}button.className='skin-btn'+(row.id===selectedCatalogId?' active':'');button.disabled=!row.installed;button.setAttribute('aria-pressed',String(row.id===selectedCatalogId));fragment.append(button)
 }$('skins').append(fragment);

}
async function requestSkin(row){
 ++loadId;
 for(const id of ['save','restore','reset','revert-selection','preset','sama-zones','mesh-show-all'])$(id).disabled=true;document.querySelectorAll('#colors input').forEach(input=>input.disabled=true);$('export').disabled=true;$('randomize').disabled=true;$('design').disabled=true;
 const ticket=++prepareTicket;selectedCatalogId=row.id;renderCatalog();let skin=manifest.find(s=>s.id===row.id);
 if(!skin){
  document.querySelectorAll('#colors input').forEach(input=>input.disabled=true);$('loading').classList.remove('hidden');$('loading').textContent='Loading '+row.name+'…';$('export').disabled=true;$('randomize').disabled=true;$('design').disabled=true;
  try{const response=await fetch('./api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare',skinId:row.id})}),result=await response.json();if(!response.ok)throw Error(result.error);skin=result.skin;manifest.push(skin);row.status=skin.library&&skin.library.maskState!=='reviewed'?'authoring_required':skin.automatic?'automatic':'reviewed';row.maskStatus=skin.library?.maskState??skin.automation?.maskStatus;row.strategy=skin.automation?.strategy;row.prepared=true;renderCatalog()}
  catch(error){if(ticket!==prepareTicket)return;row.status='failed';row.error=error.message;renderCatalog();$('loading').textContent=error.message;toast(error.message,true);return}
 }
 if(ticket!==prepareTicket)return;
 if(maskVariant==='sama'){
  try{if(!variantSkins.has(row.id)){const response=await fetch('./assets/'+row.id+'/sama/metadata.json');if(!response.ok)throw Error('This skin has no experimental selection.');const variant=await response.json();if(variant.id!==skin.id||variant.source_sha256!==skin.source_sha256||!variant.experimentVariant?.startsWith('sama-'))throw Error('The selection does not match these resources.');variantSkins.set(row.id,variant)}skin=variantSkins.get(row.id)}catch(error){toast(error.message,true);return}
 }
 if(ticket!==prepareTicket)return;
 if(maskVariant==='mesh'){
  try{
   if(!variantSkins.has(row.id)){
    const revision=requestedRevision&&row.id===revisionSkin?requestedRevision:null;if(revision&&!/^[a-f0-9]{16}$/.test(revision))throw Error('Invalid revision.');
    const result=await loadJson('./api/skins/'+row.id,{ttl:45000});if(revision&&result.skin.nativeParts.revision!==revision)throw Error('This skin revision is no longer available.');variantSkins.set(row.id,result.skin);
   }
   skin=variantSkins.get(row.id);row.nativeParts={state:'ready',groups:skin.nativeParts.editableGroups};renderCatalog();
  }catch(error){row.nativeParts={state:'failed',error:error.message};renderCatalog();toast(error.message,true);return}

 }
 if(ticket!==prepareTicket)return;const formDefinition=formsCatalog.skins[row.id];if(formDefinition?.baseSkin){const key=row.id+':base-view';try{if(!formSkins.has(key)){formSkins.set(key,await loadJson('./'+formDefinition.baseSkin))}skin=formSkins.get(key)}catch(error){toast(error.message,true);return}}
 if(ticket!==prepareTicket)return;showZones=false;$('show-zone-mask').checked=false;$('sama-zones').textContent=skin.nativeParts?'Show parts':'Show zones';document.querySelector('.palette').classList.remove('all-pieces');$('mesh-show-all').textContent='All parts';await selectSkin(skin);
}
$('sama-zones').onclick=()=>{showZones=!showZones;$('show-zone-mask').checked=showZones;$('sama-zones').textContent=showZones?(current.nativeParts?'Hide parts':'Hide zones'):(current.nativeParts?'Show parts':'Show zones');dirty=true};
$('mesh-show-all').onclick=()=>{const all=document.querySelector('.palette').classList.toggle('all-pieces');$('mesh-show-all').textContent=all?'Selected only':'All parts'};
for(const id of ['champion-filter','quality-filter','include-chromas','adc-only'])$(id).onchange=()=>{if(id==='champion-filter'&&$('champion-filter').value&&!marksman($('champion-filter').value))$('adc-only').checked=false;renderCatalog()};$('skin-search').oninput=renderCatalog;
$('edit-zones').onclick=()=>{editZones=!editZones;$('edit-zones').setAttribute('aria-pressed',String(editZones));$('edit-zones').textContent=editZones?'Editing enabled':'Edit parts';$('viewport').classList.toggle('editing',editZones)};
$('show-zone-mask').onchange=e=>{showZones=e.target.checked;$('viewport').classList.toggle('show-zones',showZones);dirty=true};
$('reset-zones').onclick=()=>{state.zoneAssignments={};restoreAssignments();refreshZoneAvailability();toast('Parts reset.')};
renderCatalog();
finishControls=new FinishControls({element:$('colors'),onEdit:(action,key)=>editPalette(()=>{action(state);finishControls.sync(current,state,mesh?.userData.finishState);dirty=true},key),onView:id=>{if(!mesh)return;rectangleSelector?.cancel();mesh.userData.finishState=id;applyNativeVisibility(mesh,current,animationPlayer.select.value);prepareVisiblePixels(mesh);refreshZoneAvailability();dirty=true}});
$('preset').onclick=()=>editPalette(applyPreset);$('design').onchange=()=>editPalette(applyPreset);$('randomize').onclick=()=>editPalette(randomizeColors);$('reset').onclick=()=>revertColours();$('revert-selection').onclick=()=>revertColours(state.selection);$('save').onclick=()=>{localStorage.setItem(paletteStorageKey(current),JSON.stringify(state));toast('Chroma saved.')};$('restore').onclick=()=>{try{const saved=JSON.parse(localStorage.getItem(paletteStorageKey(current)));if(!saved)return toast('No saved chroma for this skin.');if(saved.anchors.length<state.anchors.length&&saved.anchors.every((a,i)=>a===state.anchors[i])){const oldAnchors=saved.anchors.slice();saved.targets.push(...state.anchors.slice(oldAnchors.length).map(a=>saved.targets[oldAnchors.indexOf(a)]??a));saved.anchors=state.anchors.slice();saved.labels=state.labels}if(JSON.stringify(saved.anchors)!==JSON.stringify(state.anchors))throw Error('The saved chroma uses a different selection revision.');Object.assign(state,saved,{abilityVfx:migrateAbilityVfx(saved.abilityVfx,current.abilityVfx)});state.zoneAssignments??={};restoreAssignments();designOptions(current);abilityPreview?.sync();$('energy').value=state.energy;$('effects').checked=state.effects;colorsUI();dirty=true;toast('Chroma restored.')}catch(e){toast(e.message,true)}};$('effects').onchange=e=>editPalette(()=>state.effects=e.target.checked);$('energy').oninput=e=>editPalette(()=>state.energy=e.target.value,'energy');
function comparison(on){compare=on;$('compare').classList.toggle('held',on);dirty=true}$('compare').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);comparison(true)};$('compare').onpointerup=()=>comparison(false);$('compare').onpointercancel=()=>comparison(false);window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='b'&&!['INPUT','TEXTAREA'].includes(e.target.tagName))comparison(true)});window.addEventListener('keyup',e=>{if(e.key.toLowerCase()==='b')comparison(false)});window.addEventListener('blur',()=>comparison(false));$('rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',controls.autoRotate)};$('camera').onclick=()=>frame();$('viewtop').onclick=()=>frame(true);
const ray=new THREE.Raycaster();let down;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(painter?.mode!=='select'||!mesh||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=renderer.domElement.getBoundingClientRect();const paneWidth=rect.width/(splitView?2:1),paneX=(e.clientX-rect.left)%paneWidth;ray.setFromCamera(new THREE.Vector2(paneX/paneWidth*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);if(mesh.isSkinnedMesh){mesh.computeBoundingSphere();mesh.boundingBox=null}const hit=ray.intersectObject(mesh).filter(item=>mesh.material[item.face.materialIndex]?.visible).sort((a,b)=>Number(Boolean(mesh.material[a.face.materialIndex].userData.nativePolicy?.pickThrough))-Number(Boolean(mesh.material[b.face.materialIndex].userData.nativePolicy?.pickThrough)))[0];if(!hit)return;const material=mesh.material[hit.face.materialIndex],r=textureRecords.find(r=>r.texture===material.map);if(!r)return;const x=Math.min(r.canvas.width-1,Math.max(0,Math.floor(((hit.uv.x%1+1)%1)*r.canvas.width))),y=Math.min(r.canvas.height-1,Math.max(0,Math.floor(((hit.uv.y%1+1)%1)*r.canvas.height)));if(current.nativeParts){const role=mesh.userData.nativeTriangleRoles[hit.faceIndex]-1;if(role<0||role>=state.anchors.length){toast('This part shares its texture with another part.');return}const indices=new Set(e.shiftKey?(state.selection??[]):[]);if(e.shiftKey&&indices.has(role))indices.delete(role);else indices.add(role);if(!indices.size)indices.add(role);state.selection=[...indices];state.selectionConfirmed=true;updateMeshSelection();walkthrough?.notify('selection',{count:state.selection.length,multi:e.shiftKey});dirty=true;document.querySelector('.color-row.selected')?.scrollIntoView({block:'nearest'});return}if(editZones&&r.islands){const piece=r.islands[y*r.canvas.width+x],role=Number($('zone-role').value);if(!piece||!r.pieces.has(piece)){toast('No part selected.');return}state.zoneAssignments[r.meta.id]??={};state.zoneAssignments[r.meta.id][piece]=role;applyAssignments(r);selected=role-1;refreshZoneAvailability();dirty=true;toast('Part assigned to '+state.labels[selected]);return}selected=r.labels[y*r.canvas.width+x];if(selected>=state.anchors.length){if(current.experimentVariant)toast('This part has no selection.');return}document.querySelectorAll('.color-row').forEach((row,i)=>row.classList.toggle('selected',i===selected));const row=document.querySelectorAll('.color-row')[selected];row?.scrollIntoView({block:'nearest',behavior:'smooth'})});
new ResizeObserver(()=>{const r=$('scene').getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/(splitView?2:1)/r.height;camera.updateProjectionMatrix()}).observe($('scene'));
const exportNameDialog=new ExportNameDialog(name=>exportPalette(name).catch(()=>{}));
$('export').onclick=()=>{
 if(exporting||exportBlocked(current))return;
 const skin=rootSkins.get(current.id)??current;
 exportNameDialog.open(defaultExportName(SKIN_NAMES[skin.id]??skin.name,states.get(skinStateKey(skin))?.paletteName));
};
async function changeCharacterForm(id){
 const active=current,root=rootSkins.get(active?.id);
 const option=formsCatalog.skins[active?.id]?.options.find(value=>value.id===id);
 if(!root||!option)return;
 let view=root;
 if(option.skin){
  const key=root.id+':'+option.id;
  if(!formSkins.has(key))formSkins.set(key,await loadJson('./'+option.skin));
  view=formSkins.get(key);
 }
 if(current!==active)return;
 await selectSkin({...view,formId:option.id,activeAnimation:option.animation,hiddenSubmeshes:option.hiddenSubmeshes??view.hiddenSubmeshes});
}
$('form-select').onchange=()=>changeCharacterForm($('form-select').value).catch(error=>toast(error.message,true));
const selectionLegend=document.querySelector('.selection-legend'),selectionLegendMarkup=selectionLegend.innerHTML;
painter=new SurfacePainter({onToolChange:mode=>{selectionLegend.innerHTML=selectionLegendMarkup;if(mode!=='select'){selectionLegend.querySelectorAll('[data-rectangle-legend]').forEach(row=>row.remove());selectionLegend.firstElementChild.querySelector('span').textContent=mode==='erase'?'Erase paint':'Paint surface';selectionLegend.lastElementChild.innerHTML='<kbd>RMB</kbd><span>Rotate view</span>'}$('rotate').setAttribute('aria-pressed',String(controls.autoRotate))},element:$('paint-tools'),canvas:renderer.domElement,getContext:()=>mesh&&state?{mesh,camera,renderer,controls,records:textureRecords,state,player:animationPlayer,split:splitView}:null,onChange:()=>{if(state){state.paintLayers??=new Map();for(const record of textureRecords)if(record.paintLayer)state.paintLayers.set(record.meta.id,record.paintLayer)}dirty=true},onCommit:action=>editHistory()?.push(action)});
$('undo').onclick=()=>editHistory()?.undo();$('redo').onclick=()=>editHistory()?.redo();
const eyedropper=new ModelEyedropper({button:$('pick-colour'),canvas:renderer.domElement,getContext:()=>mesh&&state?{mesh,camera,records:textureRecords,split:splitView}:null,onPick:colour=>setTarget(state.selection.at(-1),colour),onArm:()=>{painter.cancel();painter.setMode('select');animationPlayer.playing=false;animationPlayer.syncPlay();controls.autoRotate=false},onStatus:message=>toast(message)});
partStudio=new PartStudio({element:$('colors'),getSelection:()=>({owner:state,indices:state?.selectionConfirmed&&$('loading').classList.contains('hidden')?state.selection??[]:[]}),onEdit:(action,key)=>editPalette(()=>{action(state);partStudio.sync();dirty=true},key),onPreview:visible=>{partMaskVisible=visible;dirty=true},onPick:handler=>eyedropper.arm({original:true,onPick:handler})});
rectangleSelector=new RectangleSelection({canvas:renderer.domElement,getContext:()=>mesh&&current?.nativeParts&&painter?.mode==='select'&&!eyedropper.active&&$('loading').classList.contains('hidden')?{mesh,camera,renderer,controls,player:animationPlayer,split:splitView,count:state.anchors.length,selection:state.selectionConfirmed?state.selection:[]}:null,onStart:()=>{down=null},onSelection:(indices,additive)=>{state.selection=indices;state.selectionConfirmed=true;updateMeshSelection();walkthrough?.notify('selection',{count:indices.length,multi:additive||indices.length>1});dirty=true;document.querySelector('.color-row.selected')?.scrollIntoView({block:'nearest'})},onError:()=>toast('Could not select this area. Try a smaller rectangle.',true)});
window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){const key=event.key.toLowerCase();if(key==='z'||key==='y'){event.preventDefault();painter.cancel();if(key==='y'||event.shiftKey)editHistory()?.redo();else editHistory()?.undo()}}});
$('split-compare').onclick=()=>{splitView=!splitView;$('split-compare').setAttribute('aria-pressed',String(splitView));$('viewport').classList.toggle('split-view',splitView);document.querySelector('.split-labels').hidden=!splitView;frame(false,true);walkthrough?.notify('split',{enabled:splitView})};
function updateScheme(){const colors=paletteScheme($('palette-primary').value,$('palette-scheme').value,$('palette-secondary').value,$('palette-accent').value);$('palette-secondary').value=colors[1];$('palette-accent').value=colors[2]}
$('palette-scheme').onchange=updateScheme;$('palette-primary').oninput=updateScheme;for(const id of ['palette-secondary','palette-accent'])$(id).oninput=()=>$('palette-scheme').value='custom';
$('apply-palette').onclick=()=>editPalette(()=>{state.targets=coordinatedPalette(current.zones,[$('palette-primary').value,$('palette-secondary').value,$('palette-accent').value],state.zoneAvailability?.map(zone=>zone.total));state.paletteName='Coordinated chroma';colorsUI();dirty=true});
walkthrough=createEditorTour({get:()=>({split:splitView,formCount:formsCatalog.skins[current?.id]?.options.length??0,cancel:()=>painter?.cancel(),selectableCount:state?.zoneAvailability?.filter(zone=>zone.visible>0).length??0,pause:()=>{animationPlayer.playing=false;animationPlayer.syncPlay()}})});
animationElement.addEventListener('change',event=>{if(event.target.getAttribute('aria-label')==='Animation'&&event.target.value)walkthrough.notify('animation')});
abilityPreview=new AbilityPreview({viewport:$('viewport'),palette:document.querySelector('.palette'),getState:()=>state,onEdit:(action,key)=>editPalette(action,key),onError:error=>toast(error.message,true),changeModelForm:changeCharacterForm});
let animationTime=performance.now();
function drawEditor(outline=true){updateNativeMaterials(mesh,state,{original:compare,time:animationPlayer.time});const size=renderer.getSize(new THREE.Vector2());renderer.setScissorTest(false);renderer.setViewport(0,0,size.x,size.y);if(!splitView){renderer.render(scene,camera);if(outline&&current?.nativeParts&&state?.selectionConfirmed&&!compare&&$('selection-outline').checked)selectionOutline.render(camera);return}renderer.clear();const width=Math.floor(size.x/2),materials=mesh?.material??[],originalMaps=materials.map(material=>material.map);renderer.setScissorTest(true);renderer.setViewport(0,0,width,size.y);renderer.setScissor(0,0,width,size.y);for(const material of materials){const record=textureRecords.find(record=>record.texture===material.map);if(record)material.map=record.originalTexture}updateNativeMaterials(mesh,state,{original:true,time:animationPlayer.time});renderer.render(scene,camera);materials.forEach((material,index)=>material.map=originalMaps[index]);renderer.setViewport(width,0,size.x-width,size.y);renderer.setScissor(width,0,size.x-width,size.y);updateNativeMaterials(mesh,state,{original:false,time:animationPlayer.time});renderer.render(scene,camera);if(outline&&current?.nativeParts&&state?.selectionConfirmed&&!compare&&$('selection-outline').checked)selectionOutline.render(camera,{width:size.x-width,height:size.y});renderer.setScissorTest(false);renderer.setViewport(0,0,size.x,size.y)}
renderer.setAnimationLoop(()=>{const now=performance.now(),delta=(now-animationTime)/1000;animationTime=now;if(abilityPreview.active){abilityPreview.update(delta);return}animationPlayer.update(delta);if(dirty)repaint();controls.update();drawEditor()});
await requestSkin(catalogRows.find(s=>s.id===location.hash.slice(1))??catalogRows.find(s=>s.id==='ashe-0')??catalogRows.find(s=>s.id===manifest[0].id)??catalogRows[0]);
if(new URLSearchParams(location.search).get('preset')==='1')applyPreset();
const requestedAbility=new URLSearchParams(location.search).get('ability');if(requestedAbility){abilityPreview.choose(requestedAbility);abilityPreview.open().catch(error=>toast(error.message,true))}
