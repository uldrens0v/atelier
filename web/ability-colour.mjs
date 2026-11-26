import {hsv,hsvRgb,hexRgb} from './detail-colour.mjs';
const colourFields=new Set(['color','birthcolor','fresnelcolor','constantcolor','beamcolor','particlecolor','coloroverlife','birthcoloroverride','separatelingercolor','modulationfactor']);
export function abilityRgb(rgb,settings){
 if(!settings?.enabled)return rgb.slice();const value=Math.max(...rgb),minimum=Math.min(...rgb);if(value<=0)return rgb.slice();const sourceS=(value-minimum)/value;if(sourceS<.065&&!settings.tintHighlights)return rgb.slice();const [h,s,v]=hsv(hexRgb(settings.colour));return hsvRgb(h,Math.min(1,(sourceS<.065?s:sourceS*s)*(settings.saturation??1)),value*v);
}
export function validateAbilityVfx(values,descriptor){
 if(values==null)return;if(typeof values!=='object'||Array.isArray(values))throw Error('Invalid ability colours.');const allowed=new Set((descriptor?.abilities??[]).map(ability=>ability.id));
 for(const [id,value]of Object.entries(values)){
  if(!allowed.has(id)||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['enabled','colour','saturation','tintHighlights'].includes(key)))throw Error('This ability is not prepared for recolouring.');
  if(typeof value.enabled!=='boolean'||!/^#[a-f0-9]{6}$/i.test(value.colour)||value.saturation!=null&&(!Number.isFinite(value.saturation)||value.saturation<0||value.saturation>1.5)||value.tintHighlights!=null&&typeof value.tintHighlights!=='boolean')throw Error('Invalid ability colour.');
 }
}
export function migrateAbilityVfx(values,descriptor){
 const aliases=descriptor?.legacyAbilityIds;
 if(!aliases||!values||typeof values!=='object'||Array.isArray(values))return values;
 const selected={...values};
 for(const [id,settings]of Object.entries(values)){
  if(!Object.hasOwn(aliases,id))continue;
  delete selected[id];
  for(const next of aliases[id])if(!Object.hasOwn(selected,next))selected[next]=settings;
 }
 return selected;
}
export function colourNativeSystem(system,settings){
 if(!settings?.enabled)return system;const out=structuredClone(system);
 function tint(value){if(Array.isArray(value)&&value.length===4&&value.every(v=>typeof v==='number')){const rgb=abilityRgb(value.slice(0,3),settings);value.splice(0,3,...rgb)}}
 function walk(value,colour=false){
  if(Array.isArray(value)){for(const child of value)walk(child,colour)}
  else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){const active=colour||colourFields.has(key.toLowerCase());if(colourFields.has(key.toLowerCase())&&Array.isArray(child)||active&&key==='constantValue')tint(child);else if(active&&key==='values'&&Array.isArray(child))child.forEach(tint);else walk(child,active)}
 }
 walk(out);return out;
}
export function abilityTexturePixels(original,settings){const out=new Uint8ClampedArray(original);if(!settings?.enabled)return out;for(let p=0;p<out.length;p+=4){const rgb=abilityRgb([original[p]/255,original[p+1]/255,original[p+2]/255],{...settings,tintHighlights:false});for(let c=0;c<3;c++)out[p+c]=Math.max(0,Math.min(255,Math.floor(rgb[c]*255+.5)))}return out}
export function applyAbilityColours(input,profile,values,reference=input){
 validateAbilityVfx(values,profile);const out=new Uint8Array(input),view=new DataView(out.buffer),original=new DataView(reference.buffer,reference.byteOffset,reference.byteLength);
 for(const ability of profile?.abilities??[]){const settings=values?.[ability.id];if(!settings?.enabled)continue;
  for(const slot of ability.slots){const byte=slot.format==='u8',size=byte?4:16;if(!['u8','f32'].includes(slot.format)||!Number.isInteger(slot.offset)||slot.offset<0||slot.offset+size>out.length||slot.rgba.length!==4)throw Error('Invalid ability colour reference.');for(let c=0;c<4;c++)if((byte?reference[slot.offset+c]:original.getFloat32(slot.offset+c*4,true))!==(byte?slot.rgba[c]:Math.fround(slot.rgba[c])))throw Error('The ability data does not match this skin.');const rgb=abilityRgb(slot.rgba.slice(0,3),settings);for(let c=0;c<3;c++)if(byte)out[slot.offset+c]=Math.floor(rgb[c]+.5);else view.setFloat32(slot.offset+c*4,rgb[c],true)}
 }
 return out;
}
export function applyAbilityResolverBindings(input,profile,values,reference=input){
 validateAbilityVfx(values,profile);const out=new Uint8Array(input),view=new DataView(out.buffer),original=new DataView(reference.buffer,reference.byteOffset,reference.byteLength);
 function bind(binding,enabled,applied){
  if(!Number.isInteger(binding.offset)||binding.offset<0||binding.offset+4>out.length||![binding.original,binding.replacement].every(value=>Number.isInteger(value)&&value>=0&&value<=4294967295))throw Error('Invalid projectile resource binding.');const expected=applied?binding.replacement:binding.original;if(original.getUint32(binding.offset,true)!==expected)throw Error('The projectile resource binding does not match this skin.');view.setUint32(binding.offset,enabled?binding.replacement:binding.original,true);
 }
 for(const ability of profile?.abilities??[])for(const binding of ability.resolverBindings??[])bind(binding,!!values?.[ability.id]?.enabled,ability.resolverBindingsApplied!==false);
 for(const binding of profile?.inactiveResolverBindings??[])bind(binding,false,true);
 return out;
}
export function applyAbilityTextureBindings(input,profile,values,reference=input){
 validateAbilityVfx(values,profile);const out=applyAbilityResolverBindings(input,profile,values,reference),view=new DataView(out.buffer),originalView=new DataView(reference.buffer,reference.byteOffset,reference.byteLength),encoder=new TextEncoder();
 for(const ability of profile?.abilities??[]){const enabled=!!values?.[ability.id]?.enabled;
  for(const binding of ability.bindings??[]){
   const source=ability.textureBindingsApplied===false?binding.original:binding.replacement,target=enabled?binding.replacement:binding.original;
   if(!Number.isInteger(binding.offset)||binding.offset<0)throw Error('Invalid effect texture binding.');
   if(binding.format==='string'){
    const expected=encoder.encode(source),changed=encoder.encode(target);if(expected.length!==changed.length||binding.offset+expected.length>out.length||!['assets/atelier/abilities/','assets/av/'].some(prefix=>String(binding.replacement).startsWith(prefix)))throw Error('Invalid isolated effect texture.');
    for(let i=0;i<expected.length;i++)if(reference[binding.offset+i]!==expected[i])throw Error('The effect texture binding does not match this skin.');out.set(changed,binding.offset);
   }else if(binding.format==='path'){
    if(binding.offset+8>out.length||typeof source==='number'&&!Number.isSafeInteger(source)||typeof target==='number'&&!Number.isSafeInteger(target))throw Error('Invalid effect texture hash.');if(originalView.getBigUint64(binding.offset,true)!==BigInt(source))throw Error('The effect texture hash does not match this skin.');view.setBigUint64(binding.offset,BigInt(target),true);
   }else throw Error('Unknown effect texture binding.');
  }
 }
 return out;
}
