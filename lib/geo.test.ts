import { test } from "node:test";
import assert from "node:assert/strict";
import { dragCorner, fromLocal, measureRect, rectangleFrom3, toLocal, wallsFromRoof } from "./geo.ts";

const near = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const FT = 0.3048;
const origin = { lat: 40.64, lng: -73.7 };
const at = (xFt: number, yFt: number) => fromLocal(origin, [xFt * FT, yFt * FT]);

test("local projection round-trips", () => {
  const p = at(123, -45);
  const [x, y] = toLocal(origin, p);
  near(x / FT, 123, 1e-6);
  near(y / FT, -45, 1e-6);
});

test("rectangle from three taps squares up the third point", () => {
  // 40 ft east-west base, third tap 25 ft north but 3 ft off square.
  const r = rectangleFrom3(at(0, 0), at(40, 0), at(43, 25));
  const m = measureRect(r)!;
  near(m.length, 40);
  near(m.span, 25);
  near(m.area, 1000, 1);
  near(m.bearing, 90, 0.1);
});

test("rotated rectangle measures correctly", () => {
  const θ = (30 * Math.PI) / 180;
  const u = [Math.cos(θ), Math.sin(θ)];
  const v = [-Math.sin(θ), Math.cos(θ)];
  const a = at(0, 0);
  const b = at(u[0] * 25, u[1] * 25);
  const c = at(u[0] * 25 + v[0] * 40, u[1] * 25 + v[1] * 40);
  const m = measureRect(rectangleFrom3(a, b, c))!;
  near(m.length, 40);
  near(m.span, 25);
});

test("dragging keeps it a rectangle", () => {
  let r = rectangleFrom3(at(0, 0), at(40, 0), at(40, 25));
  r = dragCorner(r, 2, at(40, 30)); // widen
  near(measureRect(r)!.span, 30);
  near(measureRect(r)!.length, 40);
  r = dragCorner(r, 1, at(45, 0)); // lengthen base, width kept
  near(measureRect(r)!.length, 45);
  near(measureRect(r)!.span, 30);
  r = dragCorner(r, 3, at(2, 20)); // D sets width from A
  near(measureRect(r)!.span, 20);
});

test("overhang deduction", () => {
  const m = measureRect(rectangleFrom3(at(0, 0), at(42, 0), at(42, 27)))!;
  const w = wallsFromRoof(m, 1);
  near(w.length, 40);
  near(w.span, 25);
});
