'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const geo=require('./geo.js'),mapGeo=require('./map-geometry.js'),turf=require('./vendor/turf.min.js');
const boundary=JSON.parse(fs.readFileSync(__dirname+'/astorp.geojson','utf8'));
const ring=(x,y,s)=>[[x,y],[x+s,y],[x+s,y+s],[x,y+s],[x,y]];
const shaded=(mask,x,y)=>turf.booleanPointInPolygon(turf.point([x,y]),mask,{ignoreBoundary:true});
test('actual mask leaves both towns clear, shades exterior and the real municipality hole',()=>{
 const before=JSON.stringify(boundary),mask=mapGeo.outsideGeometry(boundary);
 assert.equal(shaded(mask,12.947,56.134),false);assert.equal(shaded(mask,13.046,56.135),false);
 assert.equal(shaded(mask,12.6945,56.0465),true);
 const h=boundary.geometry.coordinates[1].slice(0,-1),p=h.reduce((s,c)=>[s[0]+c[0]/h.length,s[1]+c[1]/h.length],[0,0]);assert.equal(shaded(mask,...p),true);
 assert.equal(JSON.stringify(boundary),before);
});
test('mask honors polygon holes, islands and overlapping collection union, not XOR',()=>{
 const a=turf.polygon([ring(12.9,56.1,.04),ring(12.91,56.11,.01)]),b=turf.polygon([ring(12.93,56.12,.04)]);
 const multi=turf.multiPolygon([a.geometry.coordinates,b.geometry.coordinates]);
 for(const input of [turf.featureCollection([a,b]),multi]){
  const mask=mapGeo.outsideGeometry(input);assert.equal(shaded(mask,12.905,56.105),false);assert.equal(shaded(mask,12.915,56.115),true);assert.equal(shaded(mask,12.935,56.125),false);assert.equal(shaded(mask,12.96,56.145),false);assert.equal(shaded(mask,12.99,56.15),true);
 }
});
test('mask rejects broken boundary without mutating it',()=>{for(const bad of [null,{},turf.polygon([ring(12.9,56.1,.02),ring(13.9,56.1,.02)])])assert.equal(mapGeo.outsideGeometry(bad),null);});
