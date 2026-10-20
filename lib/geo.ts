// Small-area geometry for measuring a roof outline on a map.
// Points are { lat, lng }; work is done in a local flat projection (meters)
// centred on the first point, which is accurate to well under an inch over a
// house-sized area.

export interface LatLng {
  lat: number;
  lng: number;
}

type XY = [number, number];

const M_TO_FT = 3.28084;

function metersPerDegree(lat: number) {
  const φ = (lat * Math.PI) / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * φ) + 1.175 * Math.cos(4 * φ),
    lng: 111412.84 * Math.cos(φ) - 93.5 * Math.cos(3 * φ),
  };
}

export function toLocal(origin: LatLng, p: LatLng): XY {
  const m = metersPerDegree(origin.lat);
  return [(p.lng - origin.lng) * m.lng, (p.lat - origin.lat) * m.lat];
}

export function fromLocal(origin: LatLng, [x, y]: XY): LatLng {
  const m = metersPerDegree(origin.lat);
  return { lat: origin.lat + y / m.lat, lng: origin.lng + x / m.lng };
}

/**
 * Builds a rectangle from three taps: A and B are adjacent corners, C is any
 * point on the opposite side. Returns the four corners in order A, B, C', D,
 * where C' is C squared up to be perpendicular to AB.
 */
export function rectangleFrom3(a: LatLng, b: LatLng, c: LatLng): LatLng[] {
  const B = toLocal(a, b);
  const C = toLocal(a, c);
  const len = Math.hypot(B[0], B[1]);
  if (len === 0) return [a, b, b, a];
  // Unit normal to AB
  const n: XY = [-B[1] / len, B[0] / len];
  const w = (C[0] - B[0]) * n[0] + (C[1] - B[1]) * n[1];
  const c2: XY = [B[0] + n[0] * w, B[1] + n[1] * w];
  const d: XY = [n[0] * w, n[1] * w];
  return [a, b, fromLocal(a, c2), fromLocal(a, d)];
}

/**
 * Re-squares a rectangle after one corner was dragged. Dragging A or B moves
 * that end of the base edge and keeps the width; dragging C or D changes the
 * width only.
 */
export function dragCorner(corners: LatLng[], index: number, to: LatLng): LatLng[] {
  const [a, b, c] = corners;
  const width = signedWidth(a, b, c);
  if (index === 0 || index === 1) {
    const na = index === 0 ? to : a;
    const nb = index === 1 ? to : b;
    return withWidth(na, nb, width);
  }
  // C or D: project the new point onto the normal of AB.
  const ref = index === 2 ? b : a;
  const w = signedWidthFrom(a, b, ref, to);
  return withWidth(a, b, w);
}

function normal(a: LatLng, b: LatLng): XY {
  const B = toLocal(a, b);
  const len = Math.hypot(B[0], B[1]) || 1;
  return [-B[1] / len, B[0] / len];
}

function signedWidth(a: LatLng, b: LatLng, c: LatLng) {
  return signedWidthFrom(a, b, b, c);
}

function signedWidthFrom(a: LatLng, b: LatLng, ref: LatLng, p: LatLng) {
  const n = normal(a, b);
  const R = toLocal(a, ref);
  const P = toLocal(a, p);
  return (P[0] - R[0]) * n[0] + (P[1] - R[1]) * n[1];
}

function withWidth(a: LatLng, b: LatLng, w: number): LatLng[] {
  const n = normal(a, b);
  const B = toLocal(a, b);
  return [a, b, fromLocal(a, [B[0] + n[0] * w, B[1] + n[1] * w]), fromLocal(a, [n[0] * w, n[1] * w])];
}

export function distanceFt(a: LatLng, b: LatLng): number {
  const [x, y] = toLocal(a, b);
  return Math.hypot(x, y) * M_TO_FT;
}

export interface RoofOutline {
  sideAB: number; // ft
  sideBC: number; // ft
  length: number; // longer side, ft
  span: number; // shorter side, ft
  area: number; // sq ft
  bearing: number; // degrees, direction of the long side (0 = north)
}

export function measureRect(corners: LatLng[]): RoofOutline | null {
  if (corners.length < 4) return null;
  const ab = distanceFt(corners[0], corners[1]);
  const bc = distanceFt(corners[1], corners[2]);
  const longIsAB = ab >= bc;
  const [p, q] = longIsAB ? [corners[0], corners[1]] : [corners[1], corners[2]];
  const [x, y] = toLocal(p, q);
  const bearing = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 180;
  return {
    sideAB: ab,
    sideBC: bc,
    length: Math.max(ab, bc),
    span: Math.min(ab, bc),
    area: ab * bc,
    bearing,
  };
}

/** Wall dimensions from roof-outline dimensions, removing an overhang on each side. */
export function wallsFromRoof(o: RoofOutline, overhangFt: number) {
  return {
    length: Math.max(0, o.length - 2 * overhangFt),
    span: Math.max(0, o.span - 2 * overhangFt),
  };
}
