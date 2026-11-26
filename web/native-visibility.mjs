export function applyNativeVisibility(mesh,skin,action='idle'){
 if(mesh&&skin?.previewStates){const view=skin.previewStates.find(item=>item.id===(mesh.userData.finishState??'normal'))??skin.previewStates[0],visible=new Set(view.visible),groups=mesh.userData.nativeGroups??[];let changed=false;for(let i=0;i<groups.length;i++){const show=visible.has(groups[i].name);if(mesh.material[i].visible!==show){mesh.material[i].visible=show;changed=true}}mesh.userData.nativeVisibilityDirty=changed||mesh.userData.nativeVisibilityDirty;return changed}
 if(!skin?.nativeVisibility||!mesh)return false;
 const selected=action||'idle';if(mesh.userData.nativeVisibilityAction===selected)return false;mesh.userData.nativeVisibilityAction=selected;
 const state=skin.nativeVisibility[selected]??{},hidden=new Set((skin.hiddenSubmeshes??[]).map(name=>name.toLowerCase())),hide=new Set((state.hidden??[]).map(name=>name.toLowerCase())),show=new Set((state.shown??[]).map(name=>name.toLowerCase()));let changed=false;
 const groups=mesh.userData.nativeGroups??[],roles=mesh.userData.nativeTriangleRoles??[];
 for(const [index,group] of groups.entries()){
  const name=group.name.toLowerCase(),material=mesh.material[index];let visible=!hidden.has(name)&&!/smear|trail|recall|flute|instrument/i.test(name);
  if(hide.has(name))visible=false;
  if(show.has(name)&&roles.slice(group.start/3,(group.start+group.count)/3).some(role=>role>0))visible=true;
  if(material.visible!==visible){material.visible=visible;changed=true}
 }
 mesh.userData.nativeVisibilityDirty=changed||mesh.userData.nativeVisibilityDirty;return changed;
}
