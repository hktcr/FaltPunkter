/* FältPunkter boundary checks. No network calls, storage or location logging.
 * GeoJSON coordinates are [longitude, latitude]; public methods use lat, lng.
 * This is a field aid, not a legal boundary determination. A 10 m map buffer
 * does not certify source accuracy. The shipped data identifies OSM relation
 * 935517 but does not include a retrieval date or accuracy statement.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FaltGeo = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MAP_BUFFER_METERS = 10;
  const DEG = Math.PI / 180;
  const EPS = 1e-12;

  function validateCoords(lat, lng) {
    return typeof lat === 'number' && typeof lng === 'number' &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  function equal(a, b) { return a[0] === b[0] && a[1] === b[1]; }
  function cross(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }
  function onSegment(p, a, b) {
    return Math.abs(cross(a, b, p)) <= EPS &&
      p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS &&
      p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
  }
  function intersect(a, b, c, d) {
    if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) ||
        Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
        Math.max(a[1], b[1]) < Math.min(c[1], d[1]) ||
        Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
    const abC = cross(a, b, c), abD = cross(a, b, d);
    const cdA = cross(c, d, a), cdB = cross(c, d, b);
    return (abC * abD < 0 && cdA * cdB < 0) ||
      onSegment(c, a, b) || onSegment(d, a, b) ||
      onSegment(a, c, d) || onSegment(b, c, d);
  }
  // Returns 0 outside, 1 inside, 2 on the ring (orientation independent).
  function ringContains(ring, p) {
    let inside = false;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      if (onSegment(p, a, b)) return 2;
      if ((a[1] > p[1]) !== (b[1] > p[1]) &&
          p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside ? 1 : 0;
  }
  function ringsIntersect(a, b) {
    for (let i = 0; i < a.length - 1; i++) {
      for (let j = 0; j < b.length - 1; j++) {
        if (intersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
      }
    }
    return false;
  }
  function validRing(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    if (!ring.every(p => Array.isArray(p) && p.length >= 2 && validateCoords(p[1], p[0]))) return false;
    if (!equal(ring[0], ring[ring.length - 1])) return false;
    let area = 0;
    const origin = ring[0];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      if (equal(a, b)) return false;
      area += cross(origin, a, b);
      for (let j = i + 2; j < ring.length - 1; j++) {
        if (i === 0 && j === ring.length - 2) continue;
        if (intersect(a, b, ring[j], ring[j + 1])) return false;
      }
    }
    return Math.abs(area) > EPS;
  }
  function validPolygon(polygon) {
    if (!Array.isArray(polygon) || !polygon.length || !polygon.every(validRing)) return false;
    for (let h = 1; h < polygon.length; h++) {
      const hole = polygon[h];
      if (ringContains(polygon[0], hole[0]) !== 1 || ringsIntersect(polygon[0], hole)) return false;
      for (let j = 1; j < h; j++) {
        if (ringsIntersect(hole, polygon[j]) || ringContains(hole, polygon[j][0]) || ringContains(polygon[j], hole[0])) return false;
      }
    }
    return true;
  }
  const boundaryCache = new WeakMap();
  function polygonsOf(boundary) {
    if (!boundary || typeof boundary !== 'object') return null;
    // The app reuses one boundary object. An exact signature also protects
    // callers that accidentally mutate it: never reuse stale validated rings.
    // This linear pass replaces repeated quadratic topology validation.
    let signature;
    try { signature = JSON.stringify(boundary); } catch (_) { return null; }
    const cached = boundaryCache.get(boundary);
    if (cached && cached.signature === signature) return cached.polygons;
    const polygons = validateBoundary(boundary);
    boundaryCache.set(boundary, { signature, polygons });
    return polygons;
  }
  function validateBoundary(boundary) {
    const polygons = [];
    function visit(obj, depth) {
      if (!obj || typeof obj !== 'object' || depth > 16) return false;
      if (obj.type === 'Feature') return visit(obj.geometry, depth + 1);
      if (obj.type === 'FeatureCollection') {
        return Array.isArray(obj.features) && obj.features.length > 0 && obj.features.every(f => f && f.type === 'Feature' && visit(f, depth + 1));
      }
      if (obj.type === 'Polygon') {
        if (!validPolygon(obj.coordinates)) return false;
        polygons.push(obj.coordinates);
        return true;
      }
      if (obj.type === 'MultiPolygon') {
        if (!Array.isArray(obj.coordinates) || !obj.coordinates.length || !obj.coordinates.every(validPolygon)) return false;
        polygons.push(...obj.coordinates);
        return true;
      }
      return false;
    }
    return visit(boundary, 0) && polygons.length ? polygons : null;
  }
  function segmentDistance(p, a, b, scaleX, scaleY) {
    const ax = (a[0] - p[0]) * scaleX, ay = (a[1] - p[1]) * scaleY;
    const bx = (b[0] - p[0]) * scaleX, by = (b[1] - p[1]) * scaleY;
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
  }
  /**
   * Result: {status: 'inside'|'outside'|'uncertain'|'unknown',
   *          inside: boolean|null, distanceMeters: number|null}.
   * inside is the nominal point-in-polygon result, NOT a confidence flag.
   * unknown has null fields. Invalid accuracy must not silently become zero.
   * Distances are conservative local estimates, not survey measurements:
   * 110000 m/degree and minimum cosine latitude, including the query latitude.
   * Supports regional boundaries up to 5 degrees across, below 80° latitude;
   * unsupported polar/antimeridian geometries return unknown. Collection
   * polygons are a union; internal overlapping edges may add uncertainty but
   * can never create a confident outside result for a point in that union.
   */
  function classify(boundary, lat, lng, accuracyMeters = 0) {
    const unknown = { status: 'unknown', inside: null, distanceMeters: null };
    if (!validateCoords(lat, lng) || typeof accuracyMeters !== 'number' ||
        !Number.isFinite(accuracyMeters) || accuracyMeters < 0) return unknown;
    const polygons = polygonsOf(boundary);
    if (!polygons) return unknown;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const polygon of polygons) for (const ring of polygon) for (const p of ring) {
      minLat = Math.min(minLat, p[1]); maxLat = Math.max(maxLat, p[1]);
      minLng = Math.min(minLng, p[0]); maxLng = Math.max(maxLng, p[0]);
    }
    if (maxLat - minLat > 5 || maxLng - minLng > 5 || minLat < -80 || maxLat > 80 ||
        Math.abs(lng - (minLng + maxLng) / 2) > 180) return unknown;
    const maxAbsLat = Math.max(Math.abs(lat), Math.abs(minLat), Math.abs(maxLat));
    const scaleX = 110000 * Math.cos(maxAbsLat * DEG), scaleY = 110000;
    const point = [lng, lat];
    let inside = false, distanceMeters = Infinity;
    for (const polygon of polygons) {
      const outer = ringContains(polygon[0], point);
      const inHole = polygon.slice(1).some(ring => ringContains(ring, point) === 1);
      if (outer && !inHole) inside = true;
      for (const ring of polygon) for (let i = 0; i < ring.length - 1; i++) {
        distanceMeters = Math.min(distanceMeters, segmentDistance(point, ring[i], ring[i + 1], scaleX, scaleY));
      }
    }
    if (!Number.isFinite(distanceMeters)) return unknown;
    return {
      status: distanceMeters <= accuracyMeters + MAP_BUFFER_METERS + 1e-7 ? 'uncertain' : inside ? 'inside' : 'outside',
      inside,
      distanceMeters
    };
  }
  return Object.freeze({ classify, validateCoords, MAP_BUFFER_METERS });
});
