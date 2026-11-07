/* Versioned, cache-first app shell. Only public, explicitly listed static files.
 * Queries/fragments are never used as cache keys or forwarded by this worker.
 * The browser's very first visit reaches the host before a worker can control it;
 * the application never creates URLs containing coordinates. */
const VERSION='faltpunkter-v20261107-2';
const NETWORK_TIMEOUT_MS=5000;
const ASSETS=['index.html','geo.js','import.js','astorp.geojson','vendor/leaflet.js','vendor/leaflet.css','vendor/turf.min.js','icon.svg','manifest.webmanifest','data/astorp-grid-250m.geojson','data/rakobservations.json'];
const SCOPE=new URL(self.registration.scope);
const URLS=new Set(ASSETS.map(path=>new URL(path,SCOPE).href));
function canonicalURL(input){
  const url=new URL(input);
  if(url.origin!==SCOPE.origin)return null;
  url.search='';url.hash='';
  if(url.pathname===SCOPE.pathname)url.pathname+='index.html';
  return URLS.has(url.href)?url.href:null;
}
async function publicFetch(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),NETWORK_TIMEOUT_MS);
  try {
    const response=await fetch(url,{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
    if(!response.ok||response.type==='opaque')throw Error('Static asset unavailable');
    const body=await response.arrayBuffer(); // Keep timeout active through the entire body.
    const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.delete('Content-Length');
    return new Response(body,{status:response.status,statusText:response.statusText,headers});
  } finally {clearTimeout(timer);}
}
self.addEventListener('install',event=>{
  // Build the complete release before exposing it. Never overwrite an active cache.
  event.waitUntil((async()=>{
    const entries=await Promise.all([...URLS].map(async url=>[url,await publicFetch(url)]));
    const cache=await caches.open(VERSION);
    await Promise.all(entries.map(([url,response])=>cache.put(url,response)));
    // Updates wait for the user. A first install activates automatically.
  })());
});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const old=(await caches.keys()).filter(k=>k.startsWith('faltpunkter-v')&&k!==VERSION).sort().reverse();await Promise.all(old.slice(2).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=canonicalURL(event.request.url);
  if(!url)return; // No coordinates, arbitrary URLs, uploads or map tiles are cached.
  event.respondWith((async()=>{
    const cache=await caches.open(VERSION);
    const cached=await cache.match(url);
    if(cached)return cached; // Instant offline/5xx/slow-network fallback, coherent release.
    try{return await publicFetch(url);} // Recovery if an individual cache item was evicted.
    catch(_){
      // Older complete releases remain as a bounded recovery option, newest first.
      const older=(await caches.keys()).filter(k=>k.startsWith('faltpunkter-v')&&k!==VERSION).sort().reverse();
      for(const name of older){const response=await (await caches.open(name)).match(url);if(response)return response;}
      return new Response('FältPunkter saknar en komplett offlinekopia. Anslut till nätet och ladda om.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
  })());
});
