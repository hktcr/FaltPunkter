'use strict';
// VM regression tests exercise actual inline application code. Browser rendering,
// permissions UI, Clipboard integration and service worker still need browser QA.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const validPoint={id:'1',name:'Existing',tag:'',lat:56.13,lng:12.94,date:'2026-01-01T00:00:00Z'};
function app(db={value:null}) {
  let now=1800000000000;
  const elements=new Map(),intervals=[],removed=[],watches=[],windowEvents={};
  const document={activeElement:null};
  function element(id){
    if(elements.has(id))return elements.get(id);
    const classes=new Set();
    const node={value:'',textContent:'',innerHTML:'',style:{},dataset:{},disabled:false,
      classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);},toggle(x,on){if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);}},
      setAttribute(){},addEventListener(){},focus(){document.activeElement=this;},select(){},setSelectionRange(){},querySelectorAll(){return [];},click(){}};
    elements.set(id,node);return node;
  }
  Object.assign(document,{getElementById:element,querySelector:s=>element(s),querySelectorAll:()=>[],addEventListener(){},createElement:()=>element('created')});
  function layer(){return {events:{},addTo(){return this;},on(name,cb){this.events[name]=cb;return this;},bindPopup(){return this;},clearLayers(){},addLayer(){},setStyle(){},getBounds(){return {};},eachLayer(){}};}
  const map=Object.assign(layer(),{center:{lat:56.13,lng:12.94},attributionControl:{addAttribution(){}},setView(c){this.center={lat:c[0],lng:c[1]};return this;},getCenter(){return {...this.center,wrap(){return {lat:this.lat,lng:((this.lng+180)%360+360)%360-180};}};},getZoom(){return 15;},fitBounds(){},removeLayer(x){removed.push(x);},closePopup(){}});
  const featureLayers=[];
  const L={map:()=>map,tileLayer:layer,circleMarker:layer,circle:layer,layerGroup:layer,
    control:{scale:layer},DomEvent:{stopPropagation(){}},popup:()=>Object.assign(layer(),{setLatLng(){return this;},setContent(){return this;},openOn(){return this;}}),
    geoJSON(data,options){for(const f of data?.features||[]){const l=layer();l.feature=f;featureLayers.push(l);options?.onEachFeature?.(f,l);}return layer();}};
  const window={isSecureContext:true,addEventListener:(name,cb)=>{windowEvents[name]=cb;}};
  const context={window,document,L,FaltGeo:require('./geo.js'),turf:require('./vendor/turf.min.js'),
    navigator:{geolocation:{watchPosition(ok,error){watches.push({ok,error});return watches.length;},clearWatch(){}}},
    localStorage:{getItem:()=>db.value,setItem:(key,value)=>{if(db.fail)throw Error('Quota');db.value=value;}},
    fetch:()=>new Promise(()=>{}),setTimeout:()=>0,clearTimeout(){},setInterval:cb=>{intervals.push(cb);return intervals.length;},
    Date:class extends Date{static now(){return now;}},confirm:()=>true,console,Blob,URL,crypto:require('node:crypto').webcrypto};
  vm.createContext(context);vm.runInContext(code,context,{filename:'index.html'});
  return {context,map,element,intervals,removed,watches,featureLayers,windowEvents,db,run:s=>vm.runInContext(s,context),advance:ms=>{now+=ms;},fix(lat=56.13,lng=12.94,accuracy=5){watches.at(-1).ok({coords:{latitude:lat,longitude:lng,accuracy},timestamp:now});}};
}

test('GPS is opt-in; missing position never falls back to map center',()=>{
 const a=app();assert.equal(a.watches.length,0);assert.equal(a.run('getCurrentCoords()'),null);
 assert.equal(a.element('copyButton').disabled,true);assert.equal(a.element('saveButton').disabled,true);
 assert.match(a.element('astorpBadge').textContent,/saknas|gammal/);
});
test('two tabs cannot overwrite each other’s stored points',()=>{
 const db={value:JSON.stringify([validPoint])},a=app(db),b=app(db);
 a.run("points.push({id:'2',name:'A',lat:56,lng:13});persistPoints();");
 const saved=db.value;
 assert.equal(b.run("points.push({id:'3',name:'B',lat:56,lng:13});persistPoints();"),false);
 assert.equal(db.value,saved);assert.ok(JSON.parse(db.value).some(p=>p.id==='2'));
});
test('malformed legacy data and quota failure do not destroy existing data',()=>{
 const bad={value:'{broken'},a=app(bad);assert.equal(a.run('persistPoints()'),false);assert.equal(bad.value,'{broken');
 const db={value:JSON.stringify([validPoint])},b=app(db),before=db.value;db.fail=true;
 b.run("setSource('center');openSaveModal();savePoint();");
 assert.equal(db.value,before);assert.equal(b.run('points.length'),1);assert.ok(b.run('saveSnapshot'));
});
test('tap source rejects invalid coordinates and wraps repeated map worlds',()=>{
 const a=app();assert.equal(a.run("source='tap';tapPos=[56,373];getCurrentCoords()"),null);
 a.map.events.click({latlng:{lat:56,lng:373,wrap(){return {lat:56,lng:13};}}});
 assert.equal(a.run('getCurrentCoords()[1]'),13);
});
test('GPS save snapshot is fixed while naming and survives later GPS movement',()=>{
 const a=app();a.run('centerOnGPS()');a.fix();a.run('openSaveModal()');a.advance(4000);a.fix(56.14,12.95,25);
 a.element('ptName').value='Snapshot';a.run('savePoint()');
 const p=JSON.parse(a.db.value)[0];assert.equal(p.lat,56.13);assert.equal(p.lng,12.94);assert.equal(p.accuracy,5);
 assert.equal(p.date,new Date(1800000000000).toISOString());
});
test('stop and GPS error clear position and reject late callbacks',()=>{
 const a=app();a.run('centerOnGPS()');a.fix();const old=a.watches[0];a.run('stopGPS()');
 old.ok({coords:{latitude:56,longitude:13,accuracy:5},timestamp:1800000000000});
 assert.equal(a.run('gpsPos'),null);assert.equal(a.run('gpsMarker'),null);assert.equal(a.run('getCurrentCoords()'),null);
 a.run('centerOnGPS()');a.fix();a.watches.at(-1).error({code:1});
 assert.equal(a.run('gpsOn'),false);assert.equal(a.run('gpsPos'),null);assert.match(a.element('sourceNote').textContent,/nekades/);
});
test('stale GPS visuals are removed even while viewing map coordinates',()=>{
 const a=app();a.run('centerOnGPS()');a.fix();a.run("setSource('center')");a.advance(31000);a.intervals.forEach(f=>f());
 assert.equal(a.run('gpsFresh()'),false);assert.equal(a.run('gpsMarker'),null);assert.equal(a.run('gpsCircle'),null);
 assert.doesNotMatch(a.element('gpsDot').className,/good/);assert.doesNotMatch(a.element('gpsText').textContent,/GPS ±5/);
});
test('clipboard fallback preserves focused coordinate snapshot during GPS updates',async()=>{
 const a=app();a.run('centerOnGPS()');a.fix();await a.run('copyCoords()');
 const field=a.element('copyValue'),frozen=field.value;assert.equal(a.context.document.activeElement,field);
 a.fix(56.14,12.95);a.intervals.forEach(f=>f());assert.equal(field.value,frozen);
});
test('grid and rook grid clicks tolerate missing GPS coordinates',()=>{
 const a=app();a.run("gridData={type:'FeatureCollection',features:[{type:'Feature',properties:{gridId:'A1'},geometry:{type:'Polygon',coordinates:[[[12,56],[13,56],[13,57],[12,57],[12,56]]]}}]};renderGrid();");
 assert.doesNotThrow(()=>a.featureLayers.at(-1).events.click({latlng:{lat:56,lng:13}}));
 a.run('rookData={grids:{}};renderRookOverlay();');
 assert.doesNotThrow(()=>a.featureLayers.at(-1).events.click({latlng:{lat:56,lng:13}}));
});

test('aged GPS is neither copyable nor saveable and absent boundary stays unknown',()=>{
 const a=app();a.run('centerOnGPS()');a.fix();
 assert.match(a.element('astorpBadge').textContent,/laddas|saknas/);
 a.advance(31000);a.intervals.forEach(f=>f());
 assert.equal(a.run('getCurrentCoords()'),null);
 assert.equal(a.element('copyButton').disabled,true);
 assert.equal(a.element('saveButton').disabled,true);
 a.run('openSaveModal()');assert.equal(a.run('saveSnapshot'),null);
});
