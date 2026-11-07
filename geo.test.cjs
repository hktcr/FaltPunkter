'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const geo = require('./geo.js');
const boundary = JSON.parse(fs.readFileSync(path.join(__dirname, 'astorp.geojson'), 'utf8'));
const square = (x, y, size) => [[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
const polygon = (outer, ...holes) => ({type: 'Polygon', coordinates: [outer, ...holes]});
const box = polygon(square(12.9,56.1,0.02));

test('strict numeric coordinates; valid zero and world endpoints', () => {
  for (const p of [[0,0],[-90,-180],[90,180],[56.134,12.947]]) assert.equal(geo.validateCoords(...p), true);
  for (const p of [[NaN,0],[0,Infinity],[91,0],[0,181],['56',13],[null,0],[undefined,0],['',0]]) assert.equal(geo.validateCoords(...p), false);
});

test('actual shipped Åstorp geometry: town, Kvidinge, Helsingborg, Ängelholm', () => {
  // Public place-center coordinates, not user observations or private locations.
  for (const p of [[56.134,12.947],[56.135,13.046]]) {
    assert.equal(geo.classify(boundary,...p).status, 'inside');
  }
  for (const p of [[56.0465,12.6945],[56.243,12.863]]) {
    assert.equal(geo.classify(boundary,...p).status, 'outside');
  }
  assert.equal(boundary.properties.osm_id, 935517);
});

test('real boundary vertex and real hole are handled', () => {
  const [lng,lat] = boundary.geometry.coordinates[0][0];
  const atEdge = geo.classify(boundary,lat,lng);
  assert.equal(atEdge.status, 'uncertain');
  assert.equal(atEdge.distanceMeters, 0);
  const hole = boundary.geometry.coordinates[1].slice(0,-1);
  const center = hole.reduce((sum,p) => [sum[0]+p[0]/hole.length,sum[1]+p[1]/hole.length],[0,0]);
  assert.equal(geo.classify(boundary,center[1],center[0]).inside, false);
});

test('hole exclusion is independent of winding; hole edge is uncertain', () => {
  for (const reverse of [false,true]) {
    const rings = [square(12.9,56.1,0.04), square(12.91,56.11,0.01)].map(r => reverse ? r.reverse() : r);
    const shape = polygon(...rings);
    assert.equal(geo.classify(shape,56.115,12.915).status,'outside');
    assert.equal(geo.classify(shape,56.105,12.905).status,'inside');
    assert.equal(geo.classify(shape,56.11,12.915).status,'uncertain');
  }
});

test('MultiPolygon and FeatureCollection union including islands', () => {
  const multi = {type:'MultiPolygon',coordinates:[box.coordinates, polygon(square(12.95,56.1,0.02)).coordinates]};
  const collection = {type:'FeatureCollection',features:multi.coordinates.map(coordinates => ({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates}}))};
  for (const shape of [multi, collection]) {
    assert.equal(geo.classify(shape,56.11,12.91).status,'inside');
    assert.equal(geo.classify(shape,56.11,12.96).status,'inside');
    assert.equal(geo.classify(shape,56.11,12.94).status,'outside');
  }
});

test('conservative distance in metres; accuracy + 10 m map buffer', () => {
  const latitude = 56.11;
  const twentyMetersEast = 20/(110000*Math.cos(56.12*Math.PI/180));
  const inside = geo.classify(box,latitude,12.9+twentyMetersEast);
  assert.equal(inside.status,'inside');
  assert.ok(Math.abs(inside.distanceMeters-20)<0.001);
  assert.equal(geo.classify(box,latitude,12.9+twentyMetersEast,11).status,'uncertain');
  assert.equal(geo.classify(box,latitude,12.9-twentyMetersEast,11).status,'uncertain');
  assert.equal(geo.classify(box,latitude,12.9-twentyMetersEast,0).status,'outside');
  assert.equal(geo.classify(box,latitude,12.9+twentyMetersEast/4,0).status,'uncertain');
  assert.equal(geo.classify(box,latitude,12.9+twentyMetersEast/2,0).status,'uncertain');
  assert.equal(geo.classify(box,latitude,12.91,1e6).status,'uncertain');
});

test('invalid accuracy and invalid coordinates are unknown, not outside', () => {
  for (const accuracy of [null,NaN,Infinity,-1,'20']) assert.equal(geo.classify(box,56.11,12.91,accuracy).status,'unknown');
  assert.equal(geo.classify(box,'56.11',12.91).status,'unknown');
  assert.equal(geo.classify(box,56.11,undefined).status,'unknown');
  assert.equal(geo.classify(polygon(square(179,10,1)),10.5,-180).status,'unknown');
});

test('missing, partial, malformed and topologically invalid boundaries fail closed', () => {
  const invalid = [null,undefined,{}, {type:'Feature',geometry:null},
    {type:'FeatureCollection',features:[]}, {type:'MultiPolygon',coordinates:[]},
    {type:'LineString',coordinates:square(12.9,56.1,0.02)},
    polygon(square(12.9,56.1,0.02).slice(0,-1)),
    polygon([[0,0],[1,1],[2,2],[0,0]]),
    polygon([[0,0],[2,2],[0,2],[2,0],[0,0]]),
    polygon([[0,0],[0,1],[NaN,1],[0,0]]),
    polygon(square(12.9,56.1,0.02), square(12,55,0.001)),
    polygon(square(12.9,56.1,0.02), square(12.91,56.11,0.02)),
    polygon(square(12.9,56.1,0.04), square(12.91,56.11,0.02),square(12.915,56.115,0.01)),
    {type:'FeatureCollection',features:[{type:'Feature',geometry:box},{type:'Feature',geometry:null}]},
    {type:'MultiPolygon',coordinates:[box.coordinates,[]]},
    polygon(square(170,10,20)), polygon(square(0,81,1)), polygon(square(0,0,6))];
  for (const bad of invalid) assert.deepEqual(geo.classify(bad,56.11,12.91), {status:'unknown',inside:null,distanceMeters:null});
});

test('input remains unchanged and browser API is exported without dependencies', () => {
  const before = JSON.stringify(boundary);
  geo.classify(boundary,56.134,12.947);
  assert.equal(JSON.stringify(boundary),before);
  const sandbox = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'geo.js'),'utf8'),sandbox);
  assert.equal(sandbox.window.FaltGeo.validateCoords(56,13),true);
  assert.equal(sandbox.window.FaltGeo.classify(box,56.11,12.91).status,'inside');
  assert.equal(sandbox.window.FaltGeo.MAP_BUFFER_METERS,10);
});


test('cached boundary remains correct across repeated calls and accidental mutation', () => {
  const shape = structuredClone(box);
  for (let i=0;i<20;i++) assert.equal(geo.classify(shape,56.11,12.91).status,'inside');
  shape.coordinates[0][0][0] = NaN;
  assert.equal(geo.classify(shape,56.11,12.91).status,'unknown');
  shape.coordinates = structuredClone(box.coordinates);
  assert.equal(geo.classify(shape,56.11,12.91).status,'inside');
  const cycle = {type:'Feature'}; cycle.geometry=cycle;
  assert.equal(geo.classify(cycle,56,13).status,'unknown');
});
