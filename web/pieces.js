import {CHAMPIONS,SKIN_NAMES,POSITIONS,ROLE_ICONS} from './catalog-data.mjs';
import {createGalleryTour} from './walkthrough.mjs';
import {CHAMPION_ICONS} from './champion-icons.mjs';
import {attachSkinPrefetch} from './skin-prefetch.mjs';
import {loadJson} from './resource-cache.mjs';
const $=id=>document.getElementById(id);
const normalized=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
let art,selected=null,query='',role='';
const championCards=new Map(),skinCards=new Map(),sheets=new Map();
function loadSheet(index){
 if(!sheets.has(index)){const img=new Image();img.decoding='async';img.fetchPriority=index===0?'high':'low';img.src=CHAMPION_ICONS.sheets[index];const promise=img.decode().then(()=>img).catch(error=>{sheets.delete(index);throw error});sheets.set(index,promise)}return sheets.get(index);
}
const portraitObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){portraitObserver.unobserve(entry.target);entry.target.loadPortrait?.()}},{rootMargin:'200px'});
function portraitImage(champion,parent){
 const tile=CHAMPION_ICONS.tiles[champion.name];if(!tile){image(champion.icon,parent,'',true,true);return}
 const sprite=document.createElement('span');sprite.className='champion-sprite';sprite.setAttribute('aria-hidden','true');sprite.style.backgroundSize=CHAMPION_ICONS.columns*100+'% '+CHAMPION_ICONS.rows*100+'%';sprite.style.backgroundPosition=tile[1]/(CHAMPION_ICONS.columns-1)*100+'% '+tile[2]/(CHAMPION_ICONS.rows-1)*100+'%';parent.append(sprite);
 parent.loadPortrait=()=>{delete parent.loadPortrait;loadSheet(tile[0]).then(()=>{sprite.style.backgroundImage='url("'+CHAMPION_ICONS.sheets[tile[0]]+'")';parent.classList.add('art-ready')}).catch(()=>{sprite.remove();image(champion.icon,parent,'',true,true)})};
 if(tile[0]===0)parent.loadPortrait();else portraitObserver.observe(parent);
}
const walkthrough=createGalleryTour({showChampions:()=>go()});
function stateFromUrl(){
 const params=new URLSearchParams(location.search),name=params.get('champion');
 selected=art.champions.find(champion=>champion.name.toLowerCase()===name?.toLowerCase())??null;
 query=params.get('q')??'';role=Object.hasOwn(ROLE_ICONS,params.get('role'))?params.get('role'):'';
}
function locationFor(champion=null,value=''){
 const url=new URL(location.href);
 url.hash='';
 if(champion)url.searchParams.set('champion',champion.name);else url.searchParams.delete('champion');
 if(value)url.searchParams.set('q',value);else url.searchParams.delete('q');if(role)url.searchParams.set('role',role);else url.searchParams.delete('role');
 return url;
}
function go(champion=null){
 history.pushState(null,'',locationFor(champion));
 stateFromUrl();render();
 window.scrollTo({top:0,behavior:'instant'});
 $('pieces-search').focus({preventScroll:true});
}
function normalClick(event){return event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey}
function image(src,parent,initials,portrait=false,eager=false){
 const fallback=document.createElement('span');fallback.className='image-fallback';fallback.setAttribute('aria-hidden','true');fallback.textContent=initials;
 const img=document.createElement('img');img.alt='';img.loading=eager?'eager':'lazy';img.fetchPriority=eager?'high':'auto';img.decoding='async';img.width=portrait?160:960;img.height=portrait?160:600;img.addEventListener('load',()=>parent.classList.add('art-ready'),{once:true});img.src=src;
 img.addEventListener('error',()=>{img.hidden=true;parent.classList.add('missing-art')},{once:true});
 parent.append(fallback,img);
}
function championCard(champion){
 if(championCards.has(champion.name))return championCards.get(champion.name);
 const li=document.createElement('li'),link=document.createElement('a'),portrait=document.createElement('div'),name=document.createElement('span'),count=document.createElement('span');
 link.className='champion-card';link.href=locationFor(champion);link.setAttribute('aria-label','View skins for '+champion.displayName);
 portrait.className='champion-portrait';portraitImage(champion,portrait);
 name.className='champion-name';name.textContent=champion.displayName;count.className='champion-count';count.textContent=champion.skins.length+' skins';
 link.append(portrait,name,count);link.addEventListener('click',event=>{if(!normalClick(event))return;event.preventDefault();go(champion)});
 li.append(link);championCards.set(champion.name,li);return li;
}
function skinCard(skin,index){
 if(skinCards.has(skin.id))return skinCards.get(skin.id);
 const li=document.createElement('li'),link=document.createElement('a'),number=document.createElement('span'),caption=document.createElement('div'),copy=document.createElement('div'),title=document.createElement('strong'),action=document.createElement('small'),arrow=document.createElement('span');
 link.className='skin-card';link.href='./?mask=mesh#'+skin.id;link.setAttribute('aria-label','Edit '+skin.name+' in 3D');link.addEventListener('click',event=>{if(normalClick(event))walkthrough.prepareEditor(link)});
 attachSkinPrefetch(link,skin.id);image(skin.image,link,'',false,index<6);number.className='skin-number';number.textContent=skin.isBase?'CLASSIC':String(index+1).padStart(2,'0');link.append(number);

 caption.className='skin-caption';title.textContent=skin.name;action.textContent='';
 arrow.className='skin-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');copy.append(title,action);caption.append(copy,arrow);link.append(caption);li.append(link);skinCards.set(skin.id,li);return li;
}
function renderGrid(){
 const term=normalized(query);
 $('clear-search').hidden=!query;
 $('champion-grid').replaceChildren();$('skin-grid').replaceChildren();
 let count=0;
 if(selected){
  const filtered=selected.skins.filter(skin=>!term||normalized(skin.name+' '+selected.displayName).includes(term));
  filtered.forEach((skin,index)=>{const card=skinCard(skin,index);card.querySelector('a').href='./?mask=mesh#'+skin.id;$('skin-grid').append(card)});count=filtered.length;

  $('reset-search').textContent='Clear search';
 }else{
  const filtered=art.champions.filter(champion=>(!role||POSITIONS[champion.name]?.includes(role))&&(!term||normalized(champion.displayName+' '+champion.name).includes(term)));
  filtered.forEach(champion=>$('champion-grid').append(championCard(champion)));count=filtered.length;

  $('reset-search').textContent='Clear filters';
 }
 $('catalog-empty').hidden=count>0;

}
function renderRoles(){
 const holder=$('role-filters');holder.hidden=!!selected;holder.replaceChildren();
 for(const [value,label] of [['','All'],['top','Top'],['jungle','Jungle'],['mid','Mid'],['bottom','Bottom'],['support','Support']]){
  const button=document.createElement('button');button.type='button';button.className='role-filter';button.setAttribute('aria-label',value?'Filter by '+label:'All positions');button.setAttribute('aria-pressed',String(role===value));button.title=label;
  if(value)button.innerHTML=ROLE_ICONS[value];const text=document.createElement('span');text.textContent=label;button.append(text);button.onclick=()=>{role=value;history.replaceState(null,'',locationFor(null,query));renderRoles();renderGrid()};holder.append(button);
 }
}
function render(){
 document.body.classList.remove('gallery-loaded');$('catalog-hero').classList.toggle('skin-stage',!!selected);$('champions-back').hidden=!selected;$('champion-grid').hidden=!!selected;$('skin-grid').hidden=!selected;
 $('pieces-search').value=query;$('pieces-search').placeholder=selected?'Search skins…':'Search champions…';$('pieces-search').setAttribute('aria-label',selected?'Search skins':'Search champions');
 $('catalog-title').textContent=selected?selected.displayName:'Create chromas for your favourite champion skins.';
 if(selected){const base=selected.skins.find(skin=>skin.isBase)??selected.skins[0];$('champion-backdrop').src=base.image;$('champion-backdrop').hidden=false;document.title=selected.displayName+' skins · Atelier'}else{$('champion-backdrop').hidden=true;document.title='Atelier · Create your chroma'}
 renderRoles();renderGrid();walkthrough.catalogState(!!selected);requestAnimationFrame(()=>document.body.classList.add('gallery-loaded'));
}
function clearSearch(){
 query='';if(!selected)role='';$('pieces-search').value='';history.replaceState(null,'',locationFor(selected));renderRoles();renderGrid();$('pieces-search').focus();
}
$('pieces-search').addEventListener('input',event=>{query=event.target.value;history.replaceState(null,'',locationFor(selected,query));renderGrid()});
$('clear-search').addEventListener('click',clearSearch);$('reset-search').addEventListener('click',clearSearch);
$('retry-load').addEventListener('click',()=>location.reload());
$('champion-backdrop').addEventListener('error',()=>{$('champion-backdrop').hidden=true});
$('champions-back').addEventListener('click',event=>{if(!normalClick(event))return;event.preventDefault();go()});
window.addEventListener('popstate',()=>{if(art){stateFromUrl();render()}});
document.addEventListener('keydown',event=>{
 const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
 if(event.key==='/'&&!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();$('pieces-search').focus()}
 if(event.key==='Escape'&&document.activeElement===$('pieces-search')&&query){event.preventDefault();clearSearch()}
});
try{
 art=await loadJson('./catalog/visual/index.json');
 for(const champion of art.champions){champion.displayName=CHAMPIONS[champion.name].name;champion.title=CHAMPIONS[champion.name].title;for(const skin of champion.skins)skin.name=SKIN_NAMES[skin.id]}art.champions.sort((a,b)=>a.displayName.localeCompare(b.displayName,'en'));


 stateFromUrl();$('catalog-message').hidden=true;$('catalog-browser').hidden=false;render();walkthrough.ready();
}catch(error){$('catalog-message').textContent='Could not load the catalogue. Please try again.';$('retry-load').hidden=false}
