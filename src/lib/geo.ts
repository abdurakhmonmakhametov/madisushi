// Geometry for delivery zones (pure).

export type LatLng = [number, number];

/** Ray-casting point-in-polygon on [lat, lng] pairs. */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Haversine distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Axis-aligned "circle-ish" polygon around a center, for seeding zones. */
export function circlePolygon(center: LatLng, radiusMeters: number, steps = 16): LatLng[] {
  const out: LatLng[] = [];
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos((center[0] * Math.PI) / 180));
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    out.push([+(center[0] + dLat * Math.sin(a)).toFixed(6), +(center[1] + dLng * Math.cos(a)).toFixed(6)]);
  }
  return out;
}

export function isLatLng(v: unknown): v is LatLng {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
}
