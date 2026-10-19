"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  DEFAULT_HOUSE,
  DEFAULT_PROPOSAL,
  computeMetrics,
  warnings,
  type House,
  type Proposal,
  type View,
} from "@/lib/roof";
import PhotoView from "./PhotoView";
import ElevationView from "./ElevationView";
import Controls from "./Controls";
import MetricsPanel from "./MetricsPanel";

const ThreeView = dynamic(() => import("./ThreeView"), {
  ssr: false,
  loading: () => <div className="stage-empty">Loading 3D…</div>,
});

type Tab = "photo" | "drawing" | "3d";
const STORAGE_KEY = "roofviz:v1";

export default function RoofApp() {
  const [house, setHouse] = useState<House>(DEFAULT_HOUSE);
  const [proposal, setProposal] = useState<Proposal>(DEFAULT_PROPOSAL);
  const [tab, setTab] = useState<Tab>("drawing");
  const [view, setView] = useState<View>("front");
  const [loaded, setLoaded] = useState(false);

  // Restore saved numbers (photos are never stored).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.house) setHouse({ ...DEFAULT_HOUSE, ...saved.house });
        if (saved.proposal)
          setProposal({
            ...DEFAULT_PROPOSAL,
            ...saved.proposal,
            dormers: { ...DEFAULT_PROPOSAL.dormers, ...saved.proposal.dormers },
          });
      }
    } catch {
      /* storage unavailable */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ house, proposal }));
    } catch {
      /* storage unavailable */
    }
  }, [house, proposal, loaded]);

  const metrics = useMemo(() => computeMetrics(house, proposal), [house, proposal]);
  const warns = useMemo(() => warnings(house, proposal), [house, proposal]);

  const reset = () => {
    setHouse(DEFAULT_HOUSE);
    setProposal(DEFAULT_PROPOSAL);
  };

  return (
    <main className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">Roof raise visualizer</p>
          <h1>See the new roof before you frame it</h1>
        </div>
        <div className={`badge ${metrics.limitMargin >= 0 ? "ok" : "bad"}`}>
          <span className="badge-label">Ridge</span>
          <span className="badge-value">
            {metrics.ridgeHeight.toFixed(1)} / {house.heightLimit} ft
          </span>
        </div>
      </header>

      <section className="stage-wrap">
        <div className="tabs" role="tablist">
          {(
            [
              ["photo", "Photo"],
              ["drawing", "Drawing"],
              ["3d", "3D"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "tab active" : "tab"}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
          {tab !== "3d" && (
            <div className="view-toggle" aria-label="Which side of the house">
              <button className={view === "front" ? "active" : ""} onClick={() => setView("front")}>
                Long side
              </button>
              <button className={view === "side" ? "active" : ""} onClick={() => setView("side")}>
                Gable end
              </button>
            </div>
          )}
        </div>

        <div className="stage">
          {/* Kept mounted so photos survive switching tabs. */}
          <div hidden={tab !== "photo"}>
            <PhotoView
              house={house}
              proposal={proposal}
              view={view}
              onMeasured={(m) =>
                setHouse((h) => ({
                  ...h,
                  ...(m.rise !== undefined && m.rise > 0 ? { currentRise: round(m.rise) } : {}),
                  ...(m.eaveHeight !== undefined && m.eaveHeight > 0
                    ? { eaveHeight: round(m.eaveHeight) }
                    : {}),
                }))
              }
            />
          </div>
          {tab === "drawing" && <ElevationView house={house} proposal={proposal} view={view} />}
          {tab === "3d" && <ThreeView house={house} proposal={proposal} />}
        </div>
        <Legend />
      </section>

      <MetricsPanel house={house} metrics={metrics} warnings={warns} />

      <Controls house={house} proposal={proposal} onHouse={setHouse} onProposal={setProposal} />

      <footer className="foot">
        <p>
          Estimates for planning only. Assumes a rectangular footprint, an attic floor at the eave line,
          and a straight-on photo. Confirm heights, headroom rules and setbacks with your local code and an
          architect or engineer.
        </p>
        <button className="link" onClick={reset}>
          Reset to sample house
        </button>
      </footer>
    </main>
  );
}

function round(n: number) {
  return Math.round(n * 4) / 4;
}

function Legend() {
  return (
    <ul className="legend">
      <li>
        <span className="swatch new" /> New roof
      </li>
      <li>
        <span className="swatch old" /> Existing
      </li>
      <li>
        <span className="swatch limit" /> Height limit
      </li>
      <li>
        <span className="swatch head" /> 7 ft headroom
      </li>
    </ul>
  );
}
