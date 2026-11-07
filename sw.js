/* Cache only this app's static assets. Never cache coordinates or map-provider requests. */
const VERSION='faltpunkter-v20261107-1';
const ASSETS=['./','index.html','geo.js','astorp.geojson','vendor/leaflet.js','vendor/leaflet.css','vendor/turf.min.js','icon.svg','manifest.webmanifest','data/astorp-grid-250m.geojson','data/rakobservations.json'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('faltpunkter-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  const allowed=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).href));
  if(event.request.method!=='GET'||!allowed.has(url.href))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request)));
});
