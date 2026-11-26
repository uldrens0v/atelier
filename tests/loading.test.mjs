import test from 'node:test';
import assert from 'node:assert/strict';
import {ResourceCache,assetUrl} from '../web/resource-cache.mjs';
import {randomPartColours,paintRevertChanges} from '../web/chroma-actions.mjs';
import {PaintLayer} from '../web/paint-engine.mjs';

test('resource cache coalesces pending loads, retries failures and evicts by memory usage',async()=>{
 const cache=new ResourceCache({budget:8,limit:3});let calls=0;const loader=async()=>{calls++;return new Uint8Array(4)},options={size:value=>value.byteLength};
 const [first,second]=await Promise.all([cache.load('a',loader,options),cache.load('a',loader,options)]);assert.equal(calls,1);assert.equal(first,second);
 await cache.load('b',loader,options);await cache.load('a',loader,options);await cache.load('c',loader,options);assert.equal(cache.entries.has('b'),false);assert.equal(cache.bytes,8);
 await assert.rejects(cache.load('error',()=>{throw Error('offline')}));assert.equal(await cache.load('error',()=>7),7);
 await cache.load('expired',()=>1,{ttl:-1});assert.equal(await cache.load('expired',()=>2),2);assert.equal(new URL(assetUrl('./mesh.json','abc')).searchParams.get('v'),'abc');
});

test('randomize gives every editable part an independent unique colour even with identical originals',()=>{
 const anchors=Array(700).fill('#666666'),colours=randomPartColours(anchors);assert.equal(new Set(colours).size,anchors.length);assert.ok(colours.every(colour=>/^#[0-9a-f]{6}$/.test(colour)));assert.ok(new Set(colours.map(colour=>colour.slice(1,3))).size>100);
 const repeated=randomPartColours(anchors,()=>.5);assert.equal(new Set(repeated).size,anchors.length);
});

test('selection revert removes paint only from selected parts and supports exact undo and full revert',()=>{
 const layer=new PaintLayer(3,1);layer.set(0,0xff003344);layer.set(1,0xff223344);layer.set(2,0xff556677);const original=[...layer.values],records=[{paintLayer:layer,cache:{labels:new Uint32Array([0,1,2])}}],changes=paintRevertChanges(records,[0,2]);
 for(const change of changes)change.layer.applyChange(change.indices,change.after);assert.deepEqual([...layer.values],[[1,0xff223344]]);
 for(const change of changes)change.layer.applyChange(change.indices,change.before);assert.deepEqual([...layer.values].sort((a,b)=>a[0]-b[0]),original);
 for(const change of paintRevertChanges(records))change.layer.applyChange(change.indices,change.after);assert.equal(layer.values.size,0);
});
