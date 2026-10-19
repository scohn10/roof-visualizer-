// Maps roof coordinates (feet along the facade, feet above the eave line) onto
// a photo, from four taps: both eave ends, the existing ridge, and the ground.
// Assumes a roughly straight-on photo; the eave line may be tilted.

import type { Pt } from "./roof";

export type TapKey = "eaveL" | "eaveR" | "ridge" | "ground";

export const TAP_ORDER: TapKey[] = ["eaveL", "eaveR", "ridge", "ground"];

export const TAP_PROMPTS: Record<TapKey, string> = {
  eaveL: "Tap the LEFT end of the eave (where the roof meets the wall).",
  eaveR: "Tap the RIGHT end of the eave.",
  ridge: "Tap the top of the existing roof (the ridge).",
  ground: "Tap the ground directly below the left eave.",
};

export type Taps = Partial<Record<TapKey, Pt>>;

export interface Frame {
  origin: Pt; // left eave, image px
  dir: Pt; // unit vector along the eave
  up: Pt; // unit vector pointing up, perpendicular to the eave
  scale: number; // px per foot
}

export function makeFrame(taps: Taps, facadeFt: number): Frame | null {
  const { eaveL, eaveR } = taps;
  if (!eaveL || !eaveR || facadeFt <= 0) return null;
  const dx = eaveR[0] - eaveL[0];
  const dy = eaveR[1] - eaveL[1];
  const len = Math.hypot(dx, dy);
  if (len < 4) return null;
  const dir: Pt = [dx / len, dy / len];
  // Image y points down, so "up" is the eave direction rotated -90°.
  let up: Pt = [dir[1], -dir[0]];
  // If the eaves were tapped right-to-left, flip so up still points skyward.
  if (up[1] > 0) up = [-up[0], -up[1]];
  return { origin: eaveL, dir, up, scale: len / facadeFt };
}

export function toImage(f: Frame, [u, v]: Pt): Pt {
  return [
    f.origin[0] + (f.dir[0] * u + f.up[0] * v) * f.scale,
    f.origin[1] + (f.dir[1] * u + f.up[1] * v) * f.scale,
  ];
}

/** Height in feet of image point `p` above the eave line. */
export function heightAboveEave(f: Frame, p: Pt): number {
  const rx = p[0] - f.origin[0];
  const ry = p[1] - f.origin[1];
  return (rx * f.up[0] + ry * f.up[1]) / f.scale;
}

export interface Measured {
  rise?: number;
  eaveHeight?: number;
}

export function measure(taps: Taps, facadeFt: number): Measured {
  const f = makeFrame(taps, facadeFt);
  if (!f) return {};
  const out: Measured = {};
  if (taps.ridge) out.rise = heightAboveEave(f, taps.ridge);
  if (taps.ground) out.eaveHeight = -heightAboveEave(f, taps.ground);
  return out;
}
