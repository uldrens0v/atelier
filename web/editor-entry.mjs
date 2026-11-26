if(location.hash){
 const url=new URL(location.href);if(url.searchParams.get('mask')!=='mesh'){url.searchParams.set('mask','mesh');history.replaceState(null,'',url)}
 await import('./app.js');
}else{
 location.replace(new URL('pieces.html',location.href));
}
