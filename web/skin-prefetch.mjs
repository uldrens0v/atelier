import {assetUrl,loadJson} from './resource-cache.mjs';

const warmed=new Set();let active=0,formsPromise;
function constrained(){return navigator.connection?.saveData||['slow-2g','2g','3g'].includes(navigator.connection?.effectiveType)}
export async function prefetchSkin(id){
 if(constrained()||warmed.has(id)||active>=2)return;warmed.add(id);active++;
 try{
  const [result,forms]=await Promise.all([loadJson('./api/skins/'+id,{ttl:45000}),formsPromise??=loadJson('./forms/index.json')]);let skin=result.skin;const definition=forms.skins?.[id];if(definition?.baseSkin)skin=await loadJson('./'+definition.baseSkin);
  const base='./'+(skin.assetBase??('assets/'+skin.id+'/')),version=skin.nativeParts?.revision,texture=skin.textures.find(row=>row.id===skin.defaultTexture),paths=[base+skin.defaultMesh+'.json'];
  if(texture&&texture.width*texture.height<=4194304){paths.push(base+(texture.previewImage??texture.id+'.png'));const mask=skin.zones?.textures?.[texture.id]?.mask??skin.zones?.mask;if(mask)paths.push(base+mask)}
  if(skin.nativeParts?.triangleRoles)paths.push(base+skin.nativeParts.triangleRoles);
  await Promise.all(paths.map(async path=>{const response=await fetch(assetUrl(path,version),{cache:'force-cache',priority:'low'});if(response.ok)await response.arrayBuffer()}));
 }catch{warmed.delete(id)}finally{active--}
}

export function attachSkinPrefetch(element,id){let timer;const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>prefetchSkin(id),140)};element.addEventListener('pointerenter',schedule);element.addEventListener('focusin',schedule);element.addEventListener('pointerleave',()=>clearTimeout(timer));element.addEventListener('blur',()=>clearTimeout(timer));element.addEventListener('pointerdown',()=>prefetchSkin(id),{passive:true})}
