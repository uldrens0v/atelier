export function stateKey(skin){return skin.id+(skin.experimentVariant?':'+skin.experimentVariant:'')}
export function paintPayload(owner){return Object.fromEntries([...(owner.paintLayers??new Map())].filter(([,layer])=>layer.values.size).map(([id,layer])=>[id,layer.payload()]))}
export function exportDesign(current,rootSkins,states,definition,formSkins){
 const skin=rootSkins.get(current.id)??current,owner=states.get(stateKey(skin));if(!owner)throw Error('The main form has not loaded yet.');
 const palette={method:owner.method??'material-zones-v1',target:'original',skin:skin.id,experimentVariant:skin.experimentVariant,anchors:owner.anchors.slice(),targets:owner.targets.slice(),energy:owner.energy,effects:owner.effects,paint:paintPayload(owner),name:owner.paletteName??'Custom chroma',designId:owner.design,forms:{}};
 palette.colourMode=owner.colourMode??'preserve';palette.finish=owner.finish?structuredClone(owner.finish):null;
 palette.partFinishes=structuredClone(owner.partFinishes??{});palette.abilityVfx=structuredClone(owner.abilityVfx??{});
 for(const option of definition?.options??[]){if(!option.export)continue;const view=formSkins.get(skin.id+':'+option.id),saved=view&&states.get(stateKey(view));if(saved)palette.forms[option.id]={anchors:saved.anchors.slice(),targets:saved.targets.slice(),energy:saved.energy,effects:saved.effects,paint:paintPayload(saved),colourMode:saved.colourMode??'preserve',finish:saved.finish?structuredClone(saved.finish):null,partFinishes:structuredClone(saved.partFinishes??{}),abilityVfx:structuredClone(saved.abilityVfx??{})}}
 return{skin,palette,descriptorPath:definition?.baseExport};
}
