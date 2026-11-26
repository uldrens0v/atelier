export class EditHistory{
 constructor({limit=80,budget=48*1024*1024,onChange=()=>{}}={}){this.limit=limit;this.budget=budget;this.onChange=onChange;this.past=[];this.future=[];this.bytes=0;this.replaying=false}
 push(action){if(this.replaying)return;const previous=this.past.at(-1);if(action.key&&previous?.key===action.key&&Date.now()-previous.time<700){this.bytes-=previous.bytes??0;previous.redo=action.redo;previous.bytes=(previous.bytes??0)+(action.bytes??0);previous.time=Date.now();this.bytes+=previous.bytes??0}else{action.time=Date.now();this.past.push(action);this.bytes+=action.bytes??0}this.future=[];while(this.past.length>this.limit||(this.bytes>this.budget&&this.past.length>1)){const removed=this.past.shift();this.bytes-=removed.bytes??0}this.onChange()}
 seal(){const action=this.past.at(-1);if(action)delete action.key}
 undo(){const action=this.past.pop();if(!action)return false;this.bytes-=action.bytes??0;this.replaying=true;try{action.undo()}finally{this.replaying=false}delete action.key;this.future.push(action);this.onChange();return true}
 redo(){const action=this.future.pop();if(!action)return false;this.replaying=true;try{action.redo()}finally{this.replaying=false}this.past.push(action);this.bytes+=action.bytes??0;this.onChange();return true}
 get canUndo(){return this.past.length>0}
 get canRedo(){return this.future.length>0}
}

export function paletteSnapshot(state){return{targets:state.targets.slice(),energy:state.energy,effects:state.effects,paletteName:state.paletteName,design:state.design,colourMode:state.colourMode??'preserve',finish:state.finish?structuredClone(state.finish):null,partFinishes:structuredClone(state.partFinishes??{}),abilityVfx:structuredClone(state.abilityVfx??{})}}
