import {createFantome} from './fantome-engine.mjs?rev=12';
self.onmessage=async event=>{
 try{
  const {skin,palette,thumbnail,descriptorPath}=event.data;if(descriptorPath&&descriptorPath!=='forms/exports/'+skin+'-base.json')throw Error('Invalid export definition.');const response=await fetch(new URL(descriptorPath??('exports/'+skin+'.json'),import.meta.url),{credentials:'same-origin',cache:'no-cache'});
  if(!response.ok)throw Error('Could not load the export resources ('+response.status+').');
  const result=await createFantome(await response.json(),palette,{thumbnail,progress:message=>self.postMessage({progress:message})});const data=await result.blob.arrayBuffer();self.postMessage({filename:result.filename,name:result.name,textures:result.textures,data},[data]);
 }catch(error){self.postMessage({error:error.message})}
};
