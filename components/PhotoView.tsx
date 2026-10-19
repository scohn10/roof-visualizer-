"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FULL_HEADROOM,
  distanceForHeight,
  dormerShapes,
  facadeWidth,
  feetInches,
  roofOutline,
  type House,
  type Proposal,
  type Pt,
  type View,
} from "@/lib/roof";
import {
  TAP_ORDER,
  TAP_PROMPTS,
  makeFrame,
  measure,
  toImage,
  type Frame,
  type Measured,
  type TapKey,
  type Taps,
} from "@/lib/photo";

interface Props {
  house: House;
  proposal: Proposal;
  view: View;
  onMeasured: (m: Measured) => void;
}

interface Shot {
  source: HTMLCanvasElement;
  taps: Taps;
}

const MAX_PX = 1800;
const HIT_RADIUS = 28; // css px
const TAP_LABEL: Record<TapKey, string> = { eaveL: "L", eaveR: "R", ridge: "Ridge", ground: "Ground" };

export default function PhotoView({ house, proposal, view, onMeasured }: Props) {
  const [shots, setShots] = useState<Partial<Record<View, Shot>>>({});
  const [adjusting, setAdjusting] = useState(false);
  const [showNew, setShowNew] = useState(true);
  const [drag, setDrag] = useState<TapKey | null>(null);
  const [cssW, setCssW] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shot = shots[view];
  const taps = shot?.taps ?? {};
  const next = TAP_ORDER.find((k) => !taps[k]);
  const complete = !next;
  const facade = facadeWidth(view, house);
  const editable = !!shot && (!complete || adjusting);

  // Track container width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCssW(el.clientWidth));
    ro.observe(el);
    setCssW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Push photo measurements up to the form.
  const tapsKey = JSON.stringify(taps);
  useEffect(() => {
    if (!shot) return;
    const m = measure(taps, facade);
    if (m.rise !== undefined || m.eaveHeight !== undefined) onMeasured(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapsKey, facade]);

  const loadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setShots((s) => ({ ...s, [view]: { source: c, taps: {} } }));
      setAdjusting(false);
      setShowNew(true);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const setTaps = useCallback(
    (fn: (t: Taps) => Taps) =>
      setShots((s) => {
        const cur = s[view];
        if (!cur) return s;
        return { ...s, [view]: { ...cur, taps: fn(cur.taps) } };
      }),
    [view],
  );

  // Layout: fit image to width, cap height.
  const src = shot?.source;
  let dispW = cssW;
  let dispH = 0;
  if (src && cssW) {
    const maxH = typeof window !== "undefined" ? window.innerHeight * 0.68 : 600;
    dispH = (cssW * src.height) / src.width;
    if (dispH > maxH) {
      dispH = maxH;
      dispW = (maxH * src.width) / src.height;
    }
  }
  const k = src && dispW ? dispW / src.width : 1; // css px per image px

  // Draw.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !src || !dispW) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(dispW * dpr);
    c.height = Math.round(dispH * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    ctx.drawImage(src, 0, 0);
    const px = 1 / k; // one css px in image px

    const frame = makeFrame(taps, facade);
    if (frame) drawOverlay(ctx, frame, house, proposal, view, px, showNew);

    for (const key of TAP_ORDER) {
      const p = taps[key];
      if (p) drawTap(ctx, p, TAP_LABEL[key], px, drag === key);
    }

    if (drag && taps[drag]) drawLoupe(ctx, src, taps[drag]!, px, dispW);
  }, [src, dispW, dispH, k, taps, facade, house, proposal, view, showNew, drag]);

  const toImg = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * src!.width, ((e.clientY - r.top) / r.height) * src!.height];
  };

  const onDown = (e: React.PointerEvent) => {
    if (!src || !editable) return;
    const p = toImg(e);
    let hit: TapKey | null = null;
    let best = HIT_RADIUS / k;
    for (const key of TAP_ORDER) {
      const t = taps[key];
      if (!t) continue;
      const d = Math.hypot(t[0] - p[0], t[1] - p[1]);
      if (d < best) {
        best = d;
        hit = key;
      }
    }
    if (!hit && next) {
      hit = next;
      setTaps((t) => ({ ...t, [next]: p }));
    }
    if (hit) {
      setDrag(hit);
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toImg(e);
    setTaps((t) => ({ ...t, [drag]: p }));
  };

  const onUp = () => setDrag(null);

  const undo = () => {
    const placed = TAP_ORDER.filter((key) => taps[key]);
    const last = placed[placed.length - 1];
    if (!last) return;
    setTaps((t) => {
      const n = { ...t };
      delete n[last];
      return n;
    });
  };

  const step = TAP_ORDER.findIndex((k) => k === next) + 1;

  return (
    <div className="photo" ref={wrapRef}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFile(f);
          e.target.value = "";
        }}
      />

      {!src && (
        <div className="stage-empty">
          <p className="empty-title">
            Add a photo of the {view === "front" ? "long side" : "gable end"}
          </p>
          <p className="empty-sub">
            Stand back and shoot as straight-on as you can, with both ends of the eave in frame. Set the
            house's {view === "front" ? "length" : "span"} below first: the eave-to-eave distance is what
            scales the photo.
          </p>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            Take or choose a photo
          </button>
        </div>
      )}

      {src && (
        <>
          <div className={`prompt ${complete && !adjusting ? "done" : ""}`}>
            {!complete ? (
              <>
                <span className="step">
                  {step}/4
                </span>
                {TAP_PROMPTS[next!]}
              </>
            ) : adjusting ? (
              <>Drag any point to fine-tune it.</>
            ) : (
              <>
                Measured from photo: eave {feetInches(measure(taps, facade).eaveHeight ?? NaN)}, existing rise{" "}
                {feetInches(measure(taps, facade).rise ?? NaN)}
              </>
            )}
          </div>
          <canvas
            ref={canvasRef}
            className="photo-canvas"
            style={{ width: dispW, height: dispH, touchAction: editable ? "none" : "pan-y" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <div className="photo-actions">
            {!complete && (
              <button className="btn" onClick={undo} disabled={!TAP_ORDER.some((k) => taps[k])}>
                Undo
              </button>
            )}
            {complete && (
              <>
                <button className={`btn ${showNew ? "" : "on"}`} onClick={() => setShowNew((v) => !v)}>
                  {showNew ? "Show before" : "Show after"}
                </button>
                <button className={`btn ${adjusting ? "on" : ""}`} onClick={() => setAdjusting((v) => !v)}>
                  {adjusting ? "Done adjusting" : "Adjust points"}
                </button>
              </>
            )}
            <button className="btn" onClick={() => setTaps(() => ({}))}>
              Re-tap
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              New photo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const COLORS = {
  newFill: "rgba(201, 89, 47, 0.55)",
  newStroke: "#ffb08a",
  old: "#ffffff",
  limit: "#ff4d4d",
  head: "#7ee0a1",
  dormerFace: "rgba(244, 236, 220, 0.92)",
  dormerRoof: "rgba(150, 62, 30, 0.85)",
  win: "rgba(40, 62, 92, 0.9)",
};

function path(ctx: CanvasRenderingContext2D, f: Frame, pts: Pt[], close = true) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = toImage(f, p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  house: House,
  p: Proposal,
  view: View,
  px: number,
  showNew: boolean,
) {
  const F = facadeWidth(view, house);
  const He = house.eaveHeight;

  ctx.save();
  ctx.lineJoin = "round";

  if (showNew) {
    path(ctx, f, roofOutline(view, p.style, p.rise, house));
    ctx.fillStyle = COLORS.newFill;
    ctx.fill();
    ctx.strokeStyle = COLORS.newStroke;
    ctx.lineWidth = 2.5 * px;
    ctx.stroke();

    if (view === "front") {
      for (const d of dormerShapes(house, p)) {
        path(ctx, f, d.roof);
        ctx.fillStyle = COLORS.dormerRoof;
        ctx.fill();
        path(ctx, f, d.face);
        ctx.fillStyle = COLORS.dormerFace;
        ctx.fill();
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = COLORS.newStroke;
        ctx.stroke();
        path(ctx, f, d.window);
        ctx.fillStyle = COLORS.win;
        ctx.fill();
      }
    }

    if (p.rise > FULL_HEADROOM) {
      const inset = distanceForHeight(FULL_HEADROOM, p.rise, house.span);
      const span: [number, number] =
        view === "side"
          ? [inset, house.span - inset]
          : p.style === "hip"
            ? [inset, house.length - inset]
            : [0, house.length];
      if (span[1] > span[0]) {
        ctx.setLineDash([2 * px, 4 * px]);
        ctx.strokeStyle = COLORS.head;
        ctx.lineWidth = 2.5 * px;
        path(
          ctx,
          f,
          [
            [span[0], FULL_HEADROOM],
            [span[1], FULL_HEADROOM],
          ],
          false,
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // Existing roof, dashed white with a dark halo so it reads on any photo.
  const old = roofOutline(view, "gable", house.currentRise, house);
  ctx.setLineDash([8 * px, 6 * px]);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 4 * px;
  path(ctx, f, old);
  ctx.stroke();
  ctx.strokeStyle = COLORS.old;
  ctx.lineWidth = 2 * px;
  ctx.stroke();

  // Height limit
  const lv = house.heightLimit - He;
  ctx.setLineDash([10 * px, 6 * px]);
  ctx.strokeStyle = COLORS.limit;
  ctx.lineWidth = 2.5 * px;
  path(
    ctx,
    f,
    [
      [-F * 0.12, lv],
      [F * 1.12, lv],
    ],
    false,
  );
  ctx.stroke();
  ctx.setLineDash([]);

  const label = (text: string, at: Pt, color: string) => {
    const [x, y] = toImage(f, at);
    ctx.font = `600 ${13 * px}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(x - 4 * px, y - 16 * px, w + 8 * px, 20 * px);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  label(`Limit ${feetInches(house.heightLimit)}`, [-F * 0.1, lv + 0.4], COLORS.limit);
  if (showNew) {
    const apexU = view === "side" ? house.span / 2 : F / 2;
    label(`Ridge ${feetInches(He + p.rise)}`, [apexU + 1, p.rise + 0.6], COLORS.newStroke);
  }
  ctx.restore();
}

function drawTap(ctx: CanvasRenderingContext2D, p: Pt, label: string, px: number, active: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p[0], p[1], (active ? 9 : 7) * px, 0, Math.PI * 2);
  ctx.fillStyle = active ? "#ffd166" : "#1f7aec";
  ctx.fill();
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.font = `700 ${12 * px}px system-ui, sans-serif`;
  const w = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(p[0] + 10 * px, p[1] - 22 * px, w + 8 * px, 18 * px);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, p[0] + 14 * px, p[1] - 8 * px);
  ctx.restore();
}

/** Magnified view of the area under the finger, drawn in the top corner. */
function drawLoupe(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, p: Pt, px: number, dispW: number) {
  const r = 55 * px; // loupe radius, image px
  const zoom = 3;
  // Put the loupe on the side away from the finger.
  const cx = p[0] < (dispW * px) / 2 ? dispW * px - r - 10 * px : r + 10 * px;
  const cy = r + 10 * px;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const s = r / zoom;
  ctx.drawImage(src, p[0] - s, p[1] - s, s * 2, s * 2, cx - r, cy - r, r * 2, r * 2);
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 3 * px;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
}
