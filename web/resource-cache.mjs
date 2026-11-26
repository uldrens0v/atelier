export class ResourceCache{
 constructor({budget=96*1024*1024,limit=80}={}){this.budget=budget;this.limit=limit;this.entries=new Map();this.bytes=0;this.hits=0;this.misses=0}
 load(key,loader,{size=()=>0,ttl=Infinity}={}){
  const found=this.entries.get(key);if(found&&(found.pending||found.expires>Date.now())){this.entries.delete(key);this.entries.set(key,found);this.hits++;return found.promise}
  if(found)this.remove(key);this.misses++;const entry={pending:true,bytes:0,expires:Infinity};entry.promise=Promise.resolve().then(loader).then(value=>{if(this.entries.get(key)===entry){entry.pending=false;entry.bytes=Math.max(0,size(value));entry.expires=Date.now()+ttl;this.bytes+=entry.bytes;if(entry.bytes>this.budget)this.remove(key);this.trim()}return value}).catch(error=>{if(this.entries.get(key)===entry)this.remove(key);throw error});this.entries.set(key,entry);this.trim();return entry.promise;
 }
 remove(key){const entry=this.entries.get(key);if(entry)this.bytes-=entry.bytes;this.entries.delete(key)}
 trim(){for(const [key,entry] of this.entries){if(this.entries.size<=this.limit&&this.bytes<=this.budget)break;if(!entry.pending)this.remove(key)}}
}

export const resources=new ResourceCache();
const RELEASE='20261117-effect-previews';
export function assetUrl(path,version){if(!version)return path;const base=globalThis.location?.href??import.meta.url,url=new URL(path,base);url.searchParams.set('v',version);return url.href}
export function loadJson(path,{cache='default',ttl=120000}={}){
 const resolved=new URL(path,globalThis.location?.href??import.meta.url);if(/\/(?:api\/skins\/|catalog\/.*\.json|forms\/(?:index\.json|base\/|skins\/)|animations\/index\.json|assets\/manifest\.json)/.test(resolved.pathname))resolved.searchParams.set('app',RELEASE);const url=resolved.href;
 return resources.load('json:'+url,async()=>{const response=await fetch(url,{cache});if(!response.ok)throw Error('Could not load resource ('+response.status+').');const text=await response.text();return{value:JSON.parse(text),bytes:text.length*2}},{size:result=>result.bytes,ttl}).then(result=>result.value);
}
