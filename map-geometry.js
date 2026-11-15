/* Local inverse polygon. Existing bundled Turf only; no network or user data. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('./geo.js'),require('./vendor/turf.min.js')):factory(root.FaltGeo,root.turf);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FaltMap=api;
})(typeof window!=='undefined'?window:null,function(geo,turf){
  'use strict';
  function outsideGeometry(boundary){
    if(!boundary||geo.classify(boundary,56.13,12.94).status==='unknown')return null;
    let combined=null;
    turf.flattenEach(boundary,feature=>{combined=combined?turf.union(combined,feature):feature;});
    if(!combined)return null;
    // Extended background also shades the neighbouring wrapped-world edges.
    // The municipality cutout remains in its real WGS84 world; Leaflet jumps
    // dragging back to that world (worldCopyJump).
    const backdrop=turf.polygon([[[-540,-85],[540,-85],[540,85],[-540,85],[-540,-85]]]);
    return turf.difference(backdrop,combined);
  }
  return Object.freeze({outsideGeometry});
});
