import test from 'node:test';
import assert from 'node:assert/strict';
import {colourAtUv} from '../web/colour-sampler.mjs';
const record={canvas:{width:2,height:2},pixels:{data:Uint8Array.from([228,91,156,255,16,17,20,255,200,150,50,255,0,0,0,0])},original:Uint8Array.from([0,180,255,255,180,180,220,255,255,220,0,255,0,0,0,0])};
test('samples the edited gem and can sample its original colour in comparison',()=>{assert.equal(colourAtUv(record,{x:.1,y:.1}),'#e45b9c');assert.equal(colourAtUv(record,{x:.1,y:.1},true),'#00b4ff')});
test('wraps UV coordinates and ignores fully transparent surfaces',()=>{assert.equal(colourAtUv(record,{x:-.9,y:1.1}),'#e45b9c');assert.equal(colourAtUv(record,{x:.75,y:.75}),null)});
test('samples the visible atlas tile rather than a different texture frame',()=>{assert.equal(colourAtUv({...record,atlas:{columns:2,rows:2}},{x:.9,y:.9}),'#e45b9c')});
