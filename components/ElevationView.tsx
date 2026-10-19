"use client";

import {
  FULL_HEADROOM,
  distanceForHeight,
  dormerShapes,
  facadeWidth,
  feetInches,
  pitchPer12,
  roofOutline,
  type House,
  type Proposal,
  type Pt,
  type View,
} from "@/lib/roof";

interface Props {
  house: House;
  proposal: Proposal;
  view: View;
}

export default function ElevationView({ house, proposal, view }: Props) {
  const F = facadeWidth(view, house);
  const He = house.eaveHeight;
  const R = proposal.rise;
  const top = Math.max(He + R, He + house.currentRise, house.heightLimit) + 3;
  const padX = Math.max(8, F * 0.2);
  const W = F + padX * 2;
  const fs = Math.max(1, Math.min(W, top) * 0.04);
  const below = fs * 2.4;
  const H = top + below;

  // world (u along facade, h above grade) -> svg
  const X = (u: number) => u + padX;
  const Y = (h: number) => top - h;
  const pts = (list: Pt[]) => list.map(([u, v]) => `${X(u)},${Y(He + v)}`).join(" ");

  const proposed = roofOutline(view, proposal.style, R, house);
  const current = roofOutline(view, "gable", house.currentRise, house);
  const dormers = view === "front" ? dormerShapes(house, proposal) : [];

  // Headroom line
  let head: [number, number] | null = null;
  if (R > FULL_HEADROOM) {
    const inset = distanceForHeight(FULL_HEADROOM, R, house.span);
    if (view === "side") head = [inset, house.span - inset];
    else head = proposal.style === "hip" ? [inset, house.length - inset] : [0, house.length];
    if (head[1] <= head[0]) head = null;
  }

  // Windows on the walls, purely decorative.
  const floors = He > 12 ? 2 : 1;
  const floorH = He / floors;
  const winCount = Math.max(1, Math.round(F / 9));
  const winW = Math.min(3, F / (winCount * 2.2));
  const windows: { x: number; y: number }[] = [];
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < winCount; i++) {
      windows.push({ x: (F / winCount) * (i + 0.5) - winW / 2, y: f * floorH + floorH * 0.3 });
    }
  }
  const winH = Math.min(4.5, floorH * 0.5);

  const dimX = X(F) + padX * 0.45;
  const ridgeH = He + R;

  return (
    <svg
      className="elevation"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${view === "front" ? "Long side" : "Gable end"} elevation with the proposed roof`}
    >
      <defs>
        <pattern id="hatch" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1" className="hatch" />
        </pattern>
      </defs>

      {/* ground */}
      <rect x={0} y={Y(0)} width={W} height={fs * 0.7} fill="url(#hatch)" />
      <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} className="ground" />

      {/* walls */}
      <rect x={X(0)} y={Y(He)} width={F} height={He} className="wall" />
      {floors > 1 && (
        <line x1={X(0)} x2={X(F)} y1={Y(floorH)} y2={Y(floorH)} className="floorline" />
      )}
      {windows.map((w, i) => (
        <rect key={i} x={X(w.x)} y={Y(w.y + winH)} width={winW} height={winH} className="win" />
      ))}

      {/* height limit */}
      <line
        x1={X(-padX * 0.6)}
        x2={X(F + padX * 0.6)}
        y1={Y(house.heightLimit)}
        y2={Y(house.heightLimit)}
        className="limit"
      />
      <text x={X(-padX * 0.6)} y={Y(house.heightLimit) - fs * 0.4} className="lbl limit-lbl" fontSize={fs}>
        Limit {feetInches(house.heightLimit)}
      </text>

      {/* roofs */}
      <polygon points={pts(proposed)} className="roof-new" />
      {dormers.map((d, i) => (
        <g key={i}>
          <polygon points={pts(d.roof)} className="dormer-roof" />
          <polygon points={pts(d.face)} className="dormer-face" />
          <polygon points={pts(d.window)} className="win" />
        </g>
      ))}
      <polygon points={pts(current)} className="roof-old" />

      {head && (
        <>
          <line
            x1={X(head[0])}
            x2={X(head[1])}
            y1={Y(He + FULL_HEADROOM)}
            y2={Y(He + FULL_HEADROOM)}
            className="headroom"
          />
        </>
      )}

      {/* dimensions */}
      <line x1={dimX} x2={dimX} y1={Y(0)} y2={Y(ridgeH)} className="dim" />
      <line x1={dimX - fs * 0.4} x2={dimX + fs * 0.4} y1={Y(ridgeH)} y2={Y(ridgeH)} className="dim" />
      <line x1={dimX - fs * 0.4} x2={dimX + fs * 0.4} y1={Y(He)} y2={Y(He)} className="dim" />
      <text
        x={dimX + fs * 0.5}
        y={Y(ridgeH) + fs * 0.35}
        className="lbl strong"
        fontSize={fs}
      >
        {feetInches(ridgeH)}
      </text>
      <text x={dimX + fs * 0.5} y={Y(He + R / 2) + fs * 0.35} className="lbl" fontSize={fs * 0.85}>
        +{feetInches(R)}
      </text>
      <text x={dimX + fs * 0.5} y={Y(He / 2) + fs * 0.35} className="lbl muted" fontSize={fs * 0.85}>
        {feetInches(He)}
      </text>
      <text x={X(F / 2)} y={Y(0) + fs * 1.8} className="lbl muted mid" fontSize={fs * 0.85}>
        {feetInches(F)} {view === "front" ? "long side" : "gable end"} ·{" "}
        {pitchPer12(R, house.span).toFixed(1)}:12 pitch
      </text>
    </svg>
  );
}
