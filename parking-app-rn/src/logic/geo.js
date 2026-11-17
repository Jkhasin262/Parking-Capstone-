// Map math: finds which block face a GPS point is on.

const M_PER_DEG_LAT = 111320;

// Turn lng/lat into flat x/y meters around a reference latitude (accurate enough within a neighborhood).
function toXY([lng, lat], refLat) {
  return [lng * M_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180), lat * M_PER_DEG_LAT];
}

// Shortest distance from point p to the line segment a-b, in meters.
function distToSegment(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Returns { face, meters } for the closest block face, or null if none is within maxMeters.
export function nearestFace(lngLat, faces, maxMeters) {
  const refLat = lngLat[1];
  const p = toXY(lngLat, refLat);
  let best = null;
  for (const face of faces) {
    const coords = face.geometry.coordinates.map((c) => toXY(c, refLat));
    for (let i = 0; i < coords.length - 1; i++) {
      const d = distToSegment(p, coords[i], coords[i + 1]);
      if (!best || d < best.meters) best = { face, meters: d };
    }
  }
  return best && best.meters <= maxMeters ? best : null;
}

// Middle point of a block face (used for directions).
export function midpoint(face) {
  const c = face.geometry.coordinates;
  const a = c[0], b = c[c.length - 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
