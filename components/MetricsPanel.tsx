"use client";

import { feetInches, fmt, type House, type Metrics, type Warning } from "@/lib/roof";

interface Props {
  house: House;
  metrics: Metrics;
  warnings: Warning[];
}

export default function MetricsPanel({ house, metrics: m, warnings }: Props) {
  const ok = m.limitMargin >= 0;
  return (
    <section className="metrics">
      <div className={`metric hero ${ok ? "ok" : "bad"}`}>
        <span className="m-label">New ridge</span>
        <span className="m-value">{feetInches(m.ridgeHeight)}</span>
        <span className="m-sub">
          {ok
            ? `${feetInches(m.limitMargin)} under the ${fmt(house.heightLimit)} ft limit`
            : `${feetInches(-m.limitMargin)} over the ${fmt(house.heightLimit)} ft limit`}
        </span>
      </div>
      <div className="metric">
        <span className="m-label">Pitch</span>
        <span className="m-value">{m.pitch12.toFixed(1)}:12</span>
        <span className="m-sub">
          {fmt(m.pitchDeg)}° · was {m.current.pitch12.toFixed(1)}:12
        </span>
      </div>
      <div className="metric">
        <span className="m-label">Attic at 7 ft+</span>
        <span className="m-value">{Math.round(m.fullAreaDormers).toLocaleString()} sf</span>
        <span className="m-sub">
          {Math.round(m.fullArea).toLocaleString()} roof +{" "}
          {Math.round(m.fullAreaDormers - m.fullArea).toLocaleString()} dormers · was{" "}
          {Math.round(m.current.fullArea).toLocaleString()}
        </span>
      </div>
      <div className="metric">
        <span className="m-label">Attic at 5 ft+</span>
        <span className="m-value">{Math.round(m.kneeAreaDormers).toLocaleString()} sf</span>
        <span className="m-sub">was {Math.round(m.current.kneeArea).toLocaleString()}</span>
      </div>
      <div className="metric">
        <span className="m-label">Roof surface</span>
        <span className="m-value">{Math.round(m.roofArea).toLocaleString()} sf</span>
        <span className="m-sub">
          {fmt(m.roofArea / 100)} squares · +{Math.round(m.roofArea - m.current.roofArea).toLocaleString()} sf
        </span>
      </div>
      <div className="metric">
        <span className="m-label">Gable-end walls</span>
        <span className="m-value">{Math.round(m.gableWall).toLocaleString()} sf</span>
        <span className="m-sub">
          {m.gableWall >= m.current.gableWall
            ? `+${Math.round(m.gableWall - m.current.gableWall).toLocaleString()} sf new siding`
            : "hip roof: no gable walls"}
        </span>
      </div>
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w, i) => (
            <li key={i} className={w.level}>
              {w.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
