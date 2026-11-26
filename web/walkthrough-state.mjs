export const TOUR_VERSION=1;
const SEEN='atelier-walkthrough-v1',PROGRESS='atelier-walkthrough-progress-v1';
export const CATALOG_STEPS=['find','champion','skin'];
export const EDITOR_STEPS=['overview','animation','compare','part','multiple','colour','refine','history','palette','paint','export'];
export class TourState{
 constructor(local,session,cookies=globalThis.document){this.local=local;this.session=session;this.cookies=cookies;this.memory=new Map()}
 read(storage,key){try{const value=storage?.getItem(key);return value?JSON.parse(value):this.memory.get(key)??null}catch{return this.memory.get(key)??null}}
 write(storage,key,value){this.memory.set(key,value);try{storage?.setItem(key,JSON.stringify(value))}catch{}}
 get seen(){const value=this.read(this.local,SEEN);let cookie=false;try{cookie=this.cookies?.cookie.split(';').some(part=>part.trim()==='atelier_tour_seen=1')??false}catch{}const seen=!!value?.status||cookie;if(seen)this.remember();return seen}
 remember(){try{if(this.cookies)this.cookies.cookie='atelier_tour_seen=1; Path=/; Max-Age=34560000; SameSite=Lax'+(globalThis.location?.protocol==='https:'?'; Secure':'')}catch{}}
 mark(status){this.write(this.local,SEEN,{version:TOUR_VERSION,status});this.remember()}
 get progress(){const value=this.read(this.session,PROGRESS);if(value?.version!==TOUR_VERSION||!value.active)return null;const steps=value.page==='catalog'?CATALOG_STEPS:value.page==='editor'?EDITOR_STEPS:[];return steps.includes(value.step)?value:null}
 save(page,step,journey=true){const steps=page==='catalog'?CATALOG_STEPS:EDITOR_STEPS;if(!steps.includes(step))throw Error('Unknown tutorial step.');this.write(this.session,PROGRESS,{version:TOUR_VERSION,active:true,page,step,journey})}
 stop(status='dismissed'){this.mark(status);this.write(this.session,PROGRESS,{version:TOUR_VERSION,active:false})}
}
export function placeCard(rects,width,height,cardWidth,cardHeight,preference='auto'){
 const margin=16,gap=18,w=Math.min(cardWidth,width-margin*2),h=Math.min(cardHeight,height-margin*2),visible=rects.filter(rect=>rect.width>0&&rect.height>0),anchor=visible[0]??{x:width/2,y:height/2,width:0,height:0},center=anchor.x+anchor.width/2;
 const candidates=[{side:'bottom',x:center-w/2,y:anchor.y+anchor.height+gap},{side:'top',x:center-w/2,y:anchor.y-gap-h},{side:'right',x:anchor.x+anchor.width+gap,y:anchor.y+(anchor.height-h)/2},{side:'left',x:anchor.x-gap-w,y:anchor.y+(anchor.height-h)/2},{side:'corner',x:width-w-margin,y:margin+70},{side:'corner',x:margin,y:height-h-margin}];
 const overlap=(a,b)=>Math.max(0,Math.min(a.x+w,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+h,b.y+b.height)-Math.max(a.y,b.y));let best;
 for(const candidate of candidates){const x=Math.max(margin,Math.min(width-w-margin,candidate.x)),y=Math.max(margin,Math.min(height-h-margin,candidate.y)),outside=Math.abs(x-candidate.x)+Math.abs(y-candidate.y),score=visible.reduce((sum,rect)=>sum+overlap({x,y},rect),0)+outside*20+(preference!=='auto'&&candidate.side!==preference?500:0);if(!best||score<best.score)best={x,y,width:w,height:h,side:candidate.side,score}}
 return best;
}
