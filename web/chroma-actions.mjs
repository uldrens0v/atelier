export function randomPartColours(anchors,random=Math.random){
 const used=new Set();return anchors.map(source=>{
  const channels=[1,3,5].map(index=>parseInt(source.slice(index,index+2),16)/255),light=Math.max(.14,Math.min(.8,(Math.max(...channels)+Math.min(...channels))/2));let colour;
  do{const h=random(),s=.5+random()*.4,l=Math.max(.12,Math.min(.82,light*(.85+random()*.3))),a=s*Math.min(l,1-l),channel=n=>{const k=(n+h*12)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0')};colour='#'+channel(0)+channel(8)+channel(4);if(used.has(colour))colour='#'+((parseInt(colour.slice(1),16)+used.size+1)%0x1000000).toString(16).padStart(6,'0')}while(used.has(colour));used.add(colour);return colour;
 });
}
export function paintRevertChanges(records,selection=null){
 const selected=selection?new Set(selection):null,changes=[];
 for(const record of records){const layer=record.paintLayer;if(!layer)continue;const entries=[...layer.values].filter(([index])=>!selected||selected.has(record.cache.labels[index]));if(!entries.length)continue;const indices=Uint32Array.from(entries,entry=>entry[0]),before=Uint32Array.from(entries,entry=>entry[1]),after=new Uint32Array(indices.length);changes.push({layer,indices,before,after})}
 return changes;
}
