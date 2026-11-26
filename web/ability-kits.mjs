import {abilityArt,abilityAtlases} from './ability-art.mjs';

const kits = {
 jayce: [
  {id:'cannon',label:'Mercury Cannon',effects:['p-ranged','p475be451','q-impact','pfe241d3b','q-gate-impact','w-hyper','fxe','e-speed','fxr','p89a49b68','pe9de511d']},
  {id:'hammer',label:'Mercury Hammer',effects:['fxp','fxq','fxw','e-hammer','r-cannon']}
 ],
 elise: [
  {id:'base',label:'Human',art:'human',model:'base'},
  {id:'spider',label:'Spider',model:'spider'}
 ],
 nidalee: [
  {id:'base',label:'Human',art:'human',model:'base'},
  {id:'cougar',label:'Cougar',model:'cougar'}
 ],
 gnar: [
  {id:'mini',label:'Mini Gnar',effects:['p2f1ef233','q-mini-catch','fxw','w-mini-speed','fxe']},
  {id:'mega',label:'Mega Gnar',effects:['p190a31a9','q-mega-hit','w-mega','e-mega','fxr','r-wall']}
 ],
 kled: [
  {id:'mounted',label:'Mounted',effects:['p5236242b','q-trap-tether','q-trap-hit','w-mounted-hit','fxe','e-mark','r-charge','r-trail','r-impact']},
  {id:'dismounted',label:'Dismounted',effects:['pdcee06ad','q-pistol-hit','w-dismounted-hit']}
 ],
 kayn: [
  {id:'base',label:'Kayn',model:'base',effects:['pb835447c','p396fdccb','fxp','fxq','q-kayn-hit','fxw','w-kayn-hit','fxe','fxr','r-kayn-exit']},
  {id:'assassin',label:'Shadow Assassin',model:'assassin',effects:['p-assassin','q-assassin','q-assassin-hit','w-assassin','w-assassin-hit','w-assassin-clone','e-assassin','r-assassin','r-assassin-exit'],fallbacks:[['e-assassin','fxe']]},
  {id:'rhaast',label:'Rhaast',model:'rhaast',effects:['p-rhaast','q-rhaast','q-rhaast-hit','w-rhaast','w-rhaast-hit','e-rhaast','r-rhaast','r-rhaast-exit'],fallbacks:[['q-rhaast','fxq','q-kayn-hit']]}
 ],
 shyvana: [
  {id:'human',label:'Human',effects:['q-hand','q-slash','e-human']},
  {id:'dragon',label:'Dragon',effects:['q-slam','q-dragon','w-dragon','e-dragon','e-trail']}
 ],
 reksai: [
  {id:'surface',label:'Unburrowed',effects:['qsurface','fxw','fxe']},
  {id:'burrowed',label:'Burrowed',effects:['p3472d35f','qreveal','wtremor','wknock','etravel','etunnel']}
 ],
 ksante: [
  {id:'base',label:'Base',effects:['fxr']},
  {id:'all-out',label:'All Out',effects:['r-aura']}
 ],
 belveth: [
  {id:'base',label:'Base',effects:['fxq']},
  {id:'true',label:'True Form',art:'base',effects:['qtrue','rform','rvoidlings']}
 ],
 udyr: [
  {id:'base',label:'Base'},
  {id:'awakened',label:'Awakened',art:'base',effects:['qawaken','p83def8d6','wawaken','rawaken']}
 ]
};

export function abilityMatchesSlot(effect, slot) {
 return slot === 'All' || effect.key.split(/[+/]/).some(key => key.trim() === slot);
}

export function abilityView(skin, requested) {
 const champion = skin?.champion?.toLowerCase();
 const forms = kits[champion] ?? [];
 const current = forms.find(form => form.id === requested) ?? forms[0];
 const next = current && forms[(forms.indexOf(current) + 1) % forms.length];
 const available = (skin?.abilityVfx?.abilities ?? []).filter(effect => effect.available);
 const scoped = new Set(forms.flatMap(form => form.effects ?? []));
 const included = new Set(current?.effects ?? []);
 for (const [primary, ...shared] of current?.fallbacks ?? []) {
  if (!available.some(effect => effect.id === primary)) shared.forEach(id => included.add(id));
 }
 const effects = available.filter(effect => !scoped.has(effect.id) || included.has(effect.id));
 const art = abilityArt[champion];
 const icons = art?.[current?.art ?? current?.id ?? 'base'] ?? {};
 return {current, next, icons, atlas:abilityAtlases[art?.atlas], effects};
}
