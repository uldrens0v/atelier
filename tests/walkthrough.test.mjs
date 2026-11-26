import test from 'node:test';
import assert from 'node:assert/strict';
import {TourState,placeCard} from '../web/walkthrough-state.mjs';
function memory(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}}
test('the first offer persists across sessions and cookie fallback works without local storage',()=>{
 const local=memory(),session=memory(),cookies={cookie:''},state=new TourState(local,session,cookies);state.mark('offered');assert.match(cookies.cookie,/Max-Age=34560000/);assert.equal(new TourState(local,memory(),{cookie:''}).seen,true);const fallback=new TourState(null,memory(),{cookie:'other=1; atelier_tour_seen=1'});assert.equal(fallback.seen,true);
});

test('declining the welcome suppresses repeated offers without leaving an active tour',()=>{
 const local=memory(),session=memory(),state=new TourState(local,session);assert.equal(state.seen,false);state.stop();const nextPage=new TourState(local,session);assert.equal(nextPage.seen,true);assert.equal(nextPage.progress,null);
});

test('the chosen skin can hand off the tour to the editor and completion clears progress',()=>{
 const local=memory(),session=memory(),state=new TourState(local,session);state.mark('started');state.save('catalog','skin',true);state.save('editor','overview',true);const editor=new TourState(local,session);assert.deepEqual(editor.progress,{version:1,active:true,page:'editor',step:'overview',journey:true});editor.save('editor','multiple',true);assert.equal(new TourState(local,session).progress.step,'multiple');editor.stop('completed');assert.equal(new TourState(local,session).progress,null);assert.equal(editor.seen,true);
});

test('blocked browser storage does not break the guide and invalid progress is ignored',()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},state=new TourState(blocked,blocked);state.mark('started');state.save('editor','animation');assert.equal(state.seen,true);assert.equal(state.progress.step,'animation');assert.throws(()=>state.save('editor','missing'),/Unknown/);const invalid={getItem:()=>'{broken',setItem(){}};assert.equal(new TourState(invalid,invalid).progress,null);
});

test('coachmarks stay on screen and prefer available space outside the target',()=>{
 const desktop=placeCard([{x:850,y:120,width:300,height:350}],1280,800,340,250,'left');assert.ok(desktop.x+desktop.width<=850);for(const [width,height] of [[360,640],[320,480],[1280,720]]){const card=placeCard([{x:width-80,y:height-60,width:70,height:50}],width,height,340,240);assert.ok(card.x>=16&&card.y>=16);assert.ok(card.x+card.width<=width-16);assert.ok(card.y+card.height<=height-16)}
});
