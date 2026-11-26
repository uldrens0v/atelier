import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {abilityArt,abilityAtlases} from '../web/ability-art.mjs';
import {abilityMatchesSlot,abilityView} from '../web/ability-kits.mjs';

function skin(champion,entries){
 return {champion,abilityVfx:{abilities:entries.map(([id,key])=>({id,key,available:true}))}};
}

test('official skill art resolves to verified, individually cached sheets',()=>{
 const ashe=abilityView(skin('Ashe',[['fxq','Q']]));
 assert.equal(ashe.icons.Q[1],"Ranger's Focus");
 for(const atlas of abilityAtlases){
  const image=readFileSync(new URL('../web/'+atlas.file,import.meta.url));
  assert.equal(createHash('sha256').update(image).digest('hex'),atlas.revision);
 }
 for(const {atlas,...forms} of Object.values(abilityArt)){
  for(const [tile,name] of Object.values(forms.base)){
   assert.ok(tile>=0&&tile<abilityAtlases[atlas].tiles&&name);
  }
 }
});

test('Jayce swaps skill artwork and shows only effects of the selected weapon',()=>{
 const jayce=skin('Jayce',[['fxq','Q'],['p475be451','Q'],['e-hammer','E'],['fxe','E'],['fxaa','AA']]);
 const cannon=abilityView(jayce);
 const hammer=abilityView(jayce,cannon.next.id);
 assert.equal(cannon.current.id,'cannon');
 assert.equal(cannon.icons.Q[1],'Shock Blast');
 assert.equal(hammer.icons.Q[1],'To the Skies!');
 assert.notEqual(cannon.icons.Q[0],hammer.icons.Q[0]);
 assert.deepEqual(cannon.effects.map(effect=>effect.id),['p475be451','fxe','fxaa']);
 assert.deepEqual(hammer.effects.map(effect=>effect.id),['fxq','e-hammer','fxaa']);
 assert.equal(hammer.next.id,'cannon');
});

test('linked form IDs and shared spell roots resolve to their existing effects',()=>{
 const cougar=abilityView(skin('Nidalee',[['fxw','W']]),'cougar');
 assert.equal(cougar.icons.W[1],'Pounce');
 assert.equal(cougar.next.model,'base');
 const kayn=skin('Kayn',[['fxq','Q'],['q-assassin','Q'],['r-rhaast','R']]);
 assert.deepEqual(abilityView(kayn,'rhaast').effects.map(effect=>effect.id),['fxq','r-rhaast']);
 kayn.abilityVfx.abilities.push({id:'q-rhaast',key:'Q',available:true});
 assert.deepEqual(abilityView(kayn,'rhaast').effects.map(effect=>effect.id),['r-rhaast','q-rhaast']);
 const dismounted=abilityView(skin('Kled',[['pdcee06ad','Q'],['fxe','E'],['r-charge','R']]),'dismounted');
 assert.deepEqual(Object.keys(dismounted.icons),['P','Q','W']);
 assert.deepEqual(dismounted.effects.map(effect=>effect.id),['pdcee06ad']);
 assert.ok(abilityMatchesSlot({key:'W/E'},'E'));
 assert.ok(abilityMatchesSlot({key:'Q + W'},'Q'));
});
