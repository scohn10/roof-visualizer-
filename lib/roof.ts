// Core roof geometry. All lengths are in feet.
//
// Conventions
// - The footprint is a rectangle: `length` runs along the ridge, `span` runs
//   across it (eave to eave on the gable end).
// - `eaveHeight` is grade to the top of the wall / eave line. The attic floor
//   is assumed to sit at the eave line (top of the second-floor ceiling joists).
// - `rise` is eave line to ridge.

export type RoofStyle = "gable" | "hip";
export type DormerType = "shed" | "gable";

export interface Dormers {
  count: number; // per slope
  width: number; // ft, each
  type: DormerType;
  faceHeight: number; // ft above attic floor at the dormer's front wall
  setback: number; // ft from the exterior wall to the dormer face
  bothSides: boolean; // dormers on front and back slopes
}

export interface House {
  span: number;
  length: number;
  eaveHeight: number;
  currentRise: number;
  heightLimit: number;
}

export interface Proposal {
  rise: number;
  style: RoofStyle;
  dormers: Dormers;
}

export const FULL_HEADROOM = 7; // ft
export const KNEE_HEADROOM = 5; // ft
const GABLE_DORMER_PITCH = 8 / 12;
const SHED_TIE_IN_BELOW_RIDGE = 1; // ft

export const DEFAULT_HOUSE: House = {
  span: 25,
  length: 40,
  eaveHeight: 18,
  currentRise: 3.5,
  heightLimit: 30,
};

export const DEFAULT_PROPOSAL: Proposal = {
  rise: 8.5,
  style: "gable",
  dormers: {
    count: 2,
    width: 8,
    type: "shed",
    faceHeight: 7.5,
    setback: 2,
    bothSides: false,
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function pitchPer12(rise: number, span: number): number {
  return span > 0 ? (rise / (span / 2)) * 12 : 0;
}

export function pitchDegrees(rise: number, span: number): number {
  return span > 0 ? (Math.atan2(rise, span / 2) * 180) / Math.PI : 0;
}

/** Roof height above the attic floor at horizontal distance `d` in from the eave. */
export function roofHeightAt(d: number, rise: number, span: number): number {
  const half = span / 2;
  if (half <= 0) return 0;
  return (rise * clamp(d, 0, half)) / half;
}

/** Distance in from the eave at which the main roof reaches height `h`. */
export function distanceForHeight(h: number, rise: number, span: number): number {
  if (rise <= 0) return Infinity;
  return ((span / 2) * h) / rise;
}

/** Floor area under the main roof (no dormers) with at least `h` of headroom. */
export function areaWithHeadroom(
  h: number,
  rise: number,
  span: number,
  length: number,
  style: RoofStyle,
): number {
  if (rise <= h) return 0;
  const inset = distanceForHeight(h, rise, span);
  const w = Math.max(0, span - 2 * inset);
  const l = style === "hip" ? Math.max(0, length - 2 * inset) : length;
  return w * l;
}

/** Plan-view length of the ridge. A hip roof's ridge is shortened by the span. */
export function ridgeLength(style: RoofStyle, span: number, length: number): number {
  return style === "hip" ? Math.max(0, length - span) : length;
}

/** Depth a single dormer adds (in from its face) with at least `h` headroom. */
function dormerGainDepth(h: number, rise: number, span: number, d: Dormers): number {
  if (d.faceHeight < h) return 0;
  const half = span / 2;
  // Main roof already gives `h` beyond this distance from the eave.
  const mainReaches = Math.min(distanceForHeight(h, rise, span), half);
  return Math.max(0, mainReaches - d.setback);
}

export function dormerSlopes(d: Dormers): number {
  return d.bothSides ? 2 : 1;
}

/** Extra floor area with at least `h` headroom contributed by all dormers. */
export function dormerArea(h: number, rise: number, span: number, d: Dormers): number {
  if (d.count <= 0 || d.width <= 0) return 0;
  const depth = dormerGainDepth(h, rise, span, d);
  // A gable dormer's own roof slopes down to its sides, so roughly half of its
  // footprint gets the headroom a shed dormer of the same width would give.
  const factor = d.type === "shed" ? 1 : 0.5;
  return d.count * dormerSlopes(d) * d.width * depth * factor;
}

/** Sloped roof surface area (no overhangs). Same formula for gable and hip. */
export function roofSurfaceArea(rise: number, span: number, length: number): number {
  const half = span / 2;
  if (half <= 0) return 0;
  return (length * span * Math.hypot(half, rise)) / half;
}

/** Triangular gable-end wall area (both ends). Zero for a hip roof. */
export function gableWallArea(style: RoofStyle, rise: number, span: number): number {
  return style === "gable" ? span * rise : 0;
}

/** Height (above attic floor) at which a shed dormer's roof ties into the main roof. */
export function shedTieIn(rise: number, d: Dormers): number {
  return Math.max(d.faceHeight, rise - SHED_TIE_IN_BELOW_RIDGE);
}

/** Apex height (above attic floor) of a gable dormer's own little roof. */
export function gableDormerApex(d: Dormers): number {
  return d.faceHeight + (d.width / 2) * GABLE_DORMER_PITCH;
}

/** Centre positions (along the length, from the left end) of the dormers on one slope. */
export function dormerCenters(d: Dormers, length: number, style: RoofStyle, span: number): number[] {
  if (d.count <= 0) return [];
  // Keep dormers clear of the hip planes at the ends.
  const margin = style === "hip" ? span / 2 : 0;
  const usable = Math.max(0, length - 2 * margin);
  const gap = usable / d.count;
  return Array.from({ length: d.count }, (_, i) => margin + gap * (i + 0.5));
}

export interface Warning {
  level: "error" | "warn";
  text: string;
}

export function warnings(house: House, p: Proposal): Warning[] {
  const out: Warning[] = [];
  const ridge = house.eaveHeight + p.rise;
  if (ridge > house.heightLimit) {
    out.push({
      level: "error",
      text: `Ridge at ${fmt(ridge)} ft is ${fmt(ridge - house.heightLimit)} ft over the ${fmt(house.heightLimit)} ft limit.`,
    });
  }
  const d = p.dormers;
  if (d.count > 0) {
    const margin = p.style === "hip" ? house.span : 0;
    const usable = house.length - margin;
    if (d.count * d.width > usable * 0.8) {
      out.push({
        level: "warn",
        text: `${d.count} dormers at ${fmt(d.width)} ft take up most of the usable ${fmt(Math.max(0, usable))} ft of roof length.`,
      });
    }
    const top = d.type === "shed" ? d.faceHeight : gableDormerApex(d);
    if (top >= p.rise - 0.5) {
      out.push({
        level: "warn",
        text: `Dormers reach ${fmt(top)} ft above the attic floor, too close to a ${fmt(p.rise)} ft ridge. Lower them or raise the ridge.`,
      });
    }
    if (d.setback >= house.span / 2) {
      out.push({ level: "warn", text: "Dormer setback is deeper than half the span." });
    }
  }
  if (p.style === "hip" && house.length < house.span) {
    out.push({
      level: "warn",
      text: "Length is shorter than span, so the hip roof becomes a pyramid. Check that length and span aren't swapped.",
    });
  }
  return out;
}

export interface Metrics {
  pitch12: number;
  pitchDeg: number;
  ridgeHeight: number;
  limitMargin: number;
  fullArea: number;
  fullAreaDormers: number;
  kneeArea: number;
  kneeAreaDormers: number;
  roofArea: number;
  gableWall: number;
  current: {
    pitch12: number;
    ridgeHeight: number;
    fullArea: number;
    kneeArea: number;
    roofArea: number;
    gableWall: number;
  };
}

export function computeMetrics(house: House, p: Proposal): Metrics {
  const { span, length, eaveHeight, currentRise } = house;
  const full = areaWithHeadroom(FULL_HEADROOM, p.rise, span, length, p.style);
  const knee = areaWithHeadroom(KNEE_HEADROOM, p.rise, span, length, p.style);
  const ridgeHeight = eaveHeight + p.rise;
  return {
    pitch12: pitchPer12(p.rise, span),
    pitchDeg: pitchDegrees(p.rise, span),
    ridgeHeight,
    limitMargin: house.heightLimit - ridgeHeight,
    fullArea: full,
    fullAreaDormers: full + dormerArea(FULL_HEADROOM, p.rise, span, p.dormers),
    kneeArea: knee,
    kneeAreaDormers: knee + dormerArea(KNEE_HEADROOM, p.rise, span, p.dormers),
    roofArea: roofSurfaceArea(p.rise, span, length),
    gableWall: gableWallArea(p.style, p.rise, span),
    current: {
      pitch12: pitchPer12(currentRise, span),
      ridgeHeight: eaveHeight + currentRise,
      // The existing roof is treated as a gable.
      fullArea: areaWithHeadroom(FULL_HEADROOM, currentRise, span, length, "gable"),
      kneeArea: areaWithHeadroom(KNEE_HEADROOM, currentRise, span, length, "gable"),
      roofArea: roofSurfaceArea(currentRise, span, length),
      gableWall: gableWallArea("gable", currentRise, span),
    },
  };
}

export function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "–";
  const r = Number(n.toFixed(digits));
  return r.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** 8.5 -> 8' 6" */
export function feetInches(ft: number): string {
  if (!Number.isFinite(ft)) return "–";
  const sign = ft < 0 ? "-" : "";
  let f = Math.floor(Math.abs(ft));
  let i = Math.round((Math.abs(ft) - f) * 12);
  if (i === 12) {
    f += 1;
    i = 0;
  }
  return `${sign}${f}' ${i}"`;
}

// ---------------------------------------------------------------------------
// Elevation shapes, in (u, v) feet: u runs left to right along the facade,
// v runs up from the eave line. Used by both the photo overlay and the drawing.

export type View = "front" | "side"; // front = long side (length), side = gable end (span)
export type Pt = [number, number];

export function facadeWidth(view: View, house: House): number {
  return view === "front" ? house.length : house.span;
}

export function roofOutline(view: View, style: RoofStyle, rise: number, house: House): Pt[] {
  const { span, length } = house;
  if (view === "side") {
    // Gable end and hip end both read as a triangle in elevation.
    return [
      [0, 0],
      [span, 0],
      [span / 2, rise],
    ];
  }
  if (style === "gable") {
    return [
      [0, 0],
      [length, 0],
      [length, rise],
      [0, rise],
    ];
  }
  const inset = Math.min(span / 2, length / 2);
  return [
    [0, 0],
    [length, 0],
    [length - inset, rise],
    [inset, rise],
  ];
}

export interface DormerShape {
  face: Pt[]; // front wall
  roof: Pt[]; // visible dormer roof
  window: Pt[];
}

/** Dormers on the front slope as seen in the front (long-side) elevation. */
export function dormerShapes(house: House, p: Proposal): DormerShape[] {
  const d = p.dormers;
  if (d.count <= 0 || d.width <= 0) return [];
  const base = roofHeightAt(d.setback, p.rise, house.span);
  const centers = dormerCenters(d, house.length, p.style, house.span);
  return centers.map((c) => {
    const l = c - d.width / 2;
    const r = c + d.width / 2;
    const top = Math.max(base, d.faceHeight);
    const face: Pt[] = [
      [l, base],
      [r, base],
      [r, top],
      [l, top],
    ];
    let roof: Pt[];
    if (d.type === "shed") {
      const tie = Math.min(p.rise, shedTieIn(p.rise, d));
      roof = [
        [l, top],
        [r, top],
        [r, tie],
        [l, tie],
      ];
    } else {
      const apex = Math.min(p.rise, gableDormerApex(d));
      roof = [
        [l, top],
        [r, top],
        [c, apex],
      ];
    }
    const winW = Math.min(d.width * 0.55, 6);
    const winBottom = base + Math.max(0.6, (top - base) * 0.25);
    const winTop = Math.max(winBottom + 0.5, top - 0.6);
    const window: Pt[] = [
      [c - winW / 2, winBottom],
      [c + winW / 2, winBottom],
      [c + winW / 2, winTop],
      [c - winW / 2, winTop],
    ];
    return { face, roof, window };
  });
}
