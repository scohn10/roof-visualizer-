"use client";

import { feetInches, pitchPer12, type Dormers, type House, type Proposal } from "@/lib/roof";

interface Props {
  house: House;
  proposal: Proposal;
  onHouse: (h: House) => void;
  onProposal: (p: Proposal) => void;
}

export default function Controls({ house, proposal, onHouse, onProposal }: Props) {
  const setH = (k: keyof House) => (v: number) => onHouse({ ...house, [k]: v });
  const setD = <K extends keyof Dormers>(k: K, v: Dormers[K]) =>
    onProposal({ ...proposal, dormers: { ...proposal.dormers, [k]: v } });
  const half = house.span / 2;
  const maxRise = Math.max(20, Math.ceil(house.heightLimit - house.eaveHeight + 4));

  return (
    <div className="controls">
      <section className="card">
        <h2>New roof</h2>
        <Slider
          label="Rise (eave to ridge)"
          value={proposal.rise}
          min={0}
          max={maxRise}
          step={0.25}
          display={`${feetInches(proposal.rise)} · ${pitchPer12(proposal.rise, house.span).toFixed(1)}:12`}
          onChange={(v) => onProposal({ ...proposal, rise: v })}
        />
        <div className="chips" aria-label="Common pitches">
          {[4, 6, 8, 10, 12].map((p) => {
            const r = (p / 12) * half;
            const on = Math.abs(r - proposal.rise) < 0.05;
            return (
              <button
                key={p}
                className={`chip ${on ? "on" : ""}`}
                onClick={() => onProposal({ ...proposal, rise: Math.round(r * 100) / 100 })}
              >
                {p}:12
              </button>
            );
          })}
          <button
            className="chip"
            title="Highest ridge that stays under the limit"
            onClick={() =>
              onProposal({
                ...proposal,
                rise: Math.max(0, Math.floor((house.heightLimit - house.eaveHeight) * 4) / 4),
              })
            }
          >
            Max under limit
          </button>
        </div>
        <Segmented
          label="Style"
          value={proposal.style}
          options={[
            ["gable", "Gable"],
            ["hip", "Hip"],
          ]}
          onChange={(v) => onProposal({ ...proposal, style: v })}
        />
      </section>

      <section className="card">
        <h2>Dormers</h2>
        <Stepper
          label="Per side"
          value={proposal.dormers.count}
          min={0}
          max={6}
          onChange={(v) => setD("count", v)}
        />
        {proposal.dormers.count > 0 && (
          <>
            <Segmented
              label="Type"
              value={proposal.dormers.type}
              options={[
                ["shed", "Shed"],
                ["gable", "Gable"],
              ]}
              onChange={(v) => setD("type", v)}
            />
            <Slider
              label="Width each"
              value={proposal.dormers.width}
              min={3}
              max={Math.max(6, Math.floor(house.length * 0.8))}
              step={0.5}
              display={feetInches(proposal.dormers.width)}
              onChange={(v) => setD("width", v)}
            />
            <Slider
              label="Wall height inside"
              value={proposal.dormers.faceHeight}
              min={4}
              max={10}
              step={0.25}
              display={feetInches(proposal.dormers.faceHeight)}
              onChange={(v) => setD("faceHeight", v)}
            />
            <Slider
              label="Set back from wall"
              value={proposal.dormers.setback}
              min={0}
              max={Math.max(1, Math.floor(half - 1))}
              step={0.5}
              display={feetInches(proposal.dormers.setback)}
              onChange={(v) => setD("setback", v)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={proposal.dormers.bothSides}
                onChange={(e) => setD("bothSides", e.target.checked)}
              />
              Dormers on both slopes
            </label>
          </>
        )}
      </section>

      <section className="card">
        <h2>Your house</h2>
        <p className="hint">Outside dimensions. Photo taps fill in eave height and existing rise.</p>
        <div className="grid2">
          <NumberField label="Length (along ridge)" value={house.length} onChange={setH("length")} />
          <NumberField label="Span (gable end)" value={house.span} onChange={setH("span")} />
          <NumberField label="Eave height (grade to eave)" value={house.eaveHeight} onChange={setH("eaveHeight")} />
          <NumberField label="Existing rise" value={house.currentRise} onChange={setH("currentRise")} />
          <NumberField
            label="Height limit (check local code)"
            value={house.heightLimit}
            onChange={setH("heightLimit")}
          />
          <div className="field readout">
            <span>Footprint</span>
            <strong>{Math.round(house.length * house.span).toLocaleString()} sq ft</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{props.label}</span>
        <strong>{props.display}</strong>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="row">
      <span>{props.label}</span>
      <div className="segmented">
        {props.options.map(([v, l]) => (
          <button key={v} className={props.value === v ? "on" : ""} onClick={() => props.onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper(props: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="row">
      <span>{props.label}</span>
      <div className="stepper">
        <button
          aria-label="Fewer"
          disabled={props.value <= props.min}
          onClick={() => props.onChange(props.value - 1)}
        >
          −
        </button>
        <strong>{props.value}</strong>
        <button
          aria-label="More"
          disabled={props.value >= props.max}
          onClick={() => props.onChange(props.value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

function NumberField(props: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <div className="unit-input">
        <input
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          value={Number.isFinite(props.value) ? props.value : ""}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v >= 0) props.onChange(v);
          }}
        />
        <em>ft</em>
      </div>
    </label>
  );
}
