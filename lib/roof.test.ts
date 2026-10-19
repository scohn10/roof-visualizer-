import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaWithHeadroom,
  computeMetrics,
  dormerArea,
  pitchPer12,
  roofSurfaceArea,
  DEFAULT_HOUSE,
  DEFAULT_PROPOSAL,
} from "./roof.ts";
import { makeFrame, measure, toImage } from "./photo.ts";

const near = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("pitch", () => {
  near(pitchPer12(12.5, 25), 12); // 45°
  near(pitchPer12(8.5, 25), 8.16);
});

test("gable headroom area", () => {
  // 25 ft span, 14 ft rise: 7 ft headroom halfway up -> half the span.
  near(areaWithHeadroom(7, 14, 25, 40, "gable"), 12.5 * 40);
  near(areaWithHeadroom(7, 6, 25, 40, "gable"), 0);
});

test("hip headroom area shrinks the length too", () => {
  near(areaWithHeadroom(7, 14, 25, 40, "hip"), 12.5 * (40 - 12.5));
});

test("roof area equals footprint for a flat roof and grows with pitch", () => {
  near(roofSurfaceArea(0, 25, 40), 1000);
  near(roofSurfaceArea(12.5, 25, 40), 1000 * Math.SQRT2);
});

test("shed dormer gain", () => {
  const d = { ...DEFAULT_PROPOSAL.dormers, count: 1, width: 10, setback: 2 };
  // rise 8.5: main roof reaches 7 ft at 12.5*7/8.5 = 10.294 ft from the eave.
  near(dormerArea(7, 8.5, 25, d), 10 * (12.5 * (7 / 8.5) - 2));
  // Rise below 7 ft: dormer gives headroom all the way back to the centre line.
  near(dormerArea(7, 6, 25, d), 10 * (12.5 - 2));
  // Face too short for 7 ft headroom.
  near(dormerArea(7, 8.5, 25, { ...d, faceHeight: 6 }), 0);
});

test("default metrics are sane", () => {
  const m = computeMetrics(DEFAULT_HOUSE, DEFAULT_PROPOSAL);
  near(m.ridgeHeight, 26.5);
  assert.ok(m.fullAreaDormers > m.fullArea);
  assert.equal(m.current.fullArea, 0);
});

test("photo frame round-trips", () => {
  // 40 ft facade spanning 400 px, eave at y=300, ridge 35 px up, ground 180 px down.
  const taps = {
    eaveL: [100, 300] as [number, number],
    eaveR: [500, 300] as [number, number],
    ridge: [300, 265] as [number, number],
    ground: [100, 480] as [number, number],
  };
  const f = makeFrame(taps, 40)!;
  near(f.scale, 10);
  const p = toImage(f, [20, 3.5]);
  near(p[0], 300);
  near(p[1], 265);
  const m = measure(taps, 40);
  near(m.rise!, 3.5);
  near(m.eaveHeight!, 18);
  // Tapped right-to-left still measures upward.
  const flipped = measure({ ...taps, eaveL: taps.eaveR, eaveR: taps.eaveL, ground: [500, 480] }, 40);
  near(flipped.rise!, 3.5);
  near(flipped.eaveHeight!, 18);
});
