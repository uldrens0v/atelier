import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAMPIONS,SKIN_NAMES,POSITIONS,ROLE_ICONS} from '../web/catalog-data.mjs';

test('every hosted champion and skin has an English display name',()=>{
 assert.equal(Object.keys(CHAMPIONS).length,173);assert.equal(Object.keys(SKIN_NAMES).length,2135);
 assert.equal(SKIN_NAMES['neeko-50'],'Cafe Cuties Neeko');
 assert.equal(SKIN_NAMES['zoe-45'],'Cafe Cuties Zoe');
 assert.equal(SKIN_NAMES['sona-77'],'DJ Sona Ultimate Remix');
 assert.equal(SKIN_NAMES['aatrox-7'],'Blood Moon Aatrox');assert.equal(SKIN_NAMES['yasuo-2'],'PROJECT: Yasuo');assert.equal(CHAMPIONS.Bard.name,'Bard');assert.equal(CHAMPIONS.MasterYi.name,'Master Yi');
 for(const name of Object.values(SKIN_NAMES))assert.ok(typeof name==='string'&&name.length>0);
});
test('all champions have supported positions and multi-position champions remain discoverable',()=>{
 const roles=['top','jungle','mid','bottom','support'];assert.deepEqual(Object.keys(ROLE_ICONS).sort(),roles.slice().sort());
 for(const champion of Object.keys(CHAMPIONS)){assert.ok(POSITIONS[champion]?.length,champion);assert.ok(POSITIONS[champion].every(role=>roles.includes(role)),champion)}
 assert.ok(POSITIONS.Ahri.includes('mid'));assert.ok(!POSITIONS.Ahri.includes('jungle'));assert.ok(POSITIONS.Bard.includes('support'));assert.ok(POSITIONS.Yasuo.includes('top')&&POSITIONS.Yasuo.includes('mid')&&POSITIONS.Yasuo.includes('bottom'));
});
