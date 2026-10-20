"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dragCorner, measureRect, rectangleFrom3, wallsFromRoof, type LatLng } from "@/lib/geo";
import { feetInches } from "@/lib/roof";

interface Props {
  active: boolean;
  onApply: (dims: { length: number; span: number }) => void;
}

interface Place {
  display_name: string;
  lat: string;
  lon: string;
}

const STORAGE_KEY = "roofviz:map";
const TAP_PROMPTS = [
  "Find the house, zoom in, then tap one corner of the roof.",
  "Tap the next corner along the same edge.",
  "Tap any corner on the opposite edge. The outline squares itself up.",
];

const cornerIcon = (label: string) =>
  L.divIcon({
    className: "map-corner",
    html: `<span>${label}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const labelIcon = (text: string) =>
  L.divIcon({ className: "map-edge-label", html: `<span>${text}</span>`, iconSize: [0, 0] });

const mid = (a: LatLng, b: LatLng): L.LatLngExpression => [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
const ll = (p: L.LatLng): LatLng => ({ lat: p.lat, lng: p.lng });

export default function MapMeasure({ active, onApply }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const tapsRef = useRef<LatLng[]>([]);
  const cornersRef = useRef<LatLng[] | null>(null);

  const [taps, setTaps] = useState<LatLng[]>([]);
  const [corners, setCorners] = useState<LatLng[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [overhang, setOverhang] = useState(1);
  const [applied, setApplied] = useState(false);

  tapsRef.current = taps;
  cornersRef.current = corners;

  // Map setup
  useEffect(() => {
    let start: { center: [number, number]; zoom: number } = { center: [39.5, -98.35], zoom: 4 };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.center) start = saved;
    } catch {
      /* ignore */
    }
    const map = L.map(divRef.current!, {
      center: start.center,
      zoom: start.zoom,
      maxZoom: 21,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 19,
      maxZoom: 21,
      attribution:
        "Imagery &copy; Esri, Maxar, Earthstar Geographics &middot; Search &copy; OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (cornersRef.current) return;
      const next = [...tapsRef.current, ll(e.latlng)];
      if (next.length === 3) {
        setCorners(rectangleFrom3(next[0], next[1], next[2]));
        setTaps([]);
      } else {
        setTaps(next);
      }
      setApplied(false);
    });
    map.on("moveend", () => {
      try {
        const c = map.getCenter();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }));
      } catch {
        /* ignore */
      }
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Leaflet needs a nudge when its container goes from hidden to visible.
  useEffect(() => {
    if (active) setTimeout(() => mapRef.current?.invalidateSize(), 50);
  }, [active]);

  // Draw taps / outline
  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    group.clearLayers();
    // The search pin would cover the outline labels once measuring is done.
    pinRef.current?.setOpacity(corners ? 0 : 1);

    if (!corners) {
      taps.forEach((t, i) => L.marker([t.lat, t.lng], { icon: cornerIcon(String(i + 1)) }).addTo(group));
      if (taps.length === 2) {
        L.polyline(
          taps.map((t) => [t.lat, t.lng] as [number, number]),
          { color: "#ffb08a", weight: 3 },
        ).addTo(group);
      }
      return;
    }

    const poly = L.polygon(
      corners.map((c) => [c.lat, c.lng] as [number, number]),
      { color: "#ffb08a", weight: 3, fillColor: "#c9592f", fillOpacity: 0.25 },
    ).addTo(group);
    const labelAB = L.marker(mid(corners[0], corners[1]), { icon: labelIcon(""), interactive: false }).addTo(group);
    const labelBC = L.marker(mid(corners[1], corners[2]), { icon: labelIcon(""), interactive: false }).addTo(group);
    const markers = corners.map((c, i) =>
      L.marker([c.lat, c.lng], { icon: cornerIcon("ABCD"[i]), draggable: true, autoPan: true }).addTo(group),
    );

    const paint = (cs: LatLng[]) => {
      poly.setLatLngs(cs.map((c) => [c.lat, c.lng] as [number, number]));
      const m = measureRect(cs)!;
      labelAB.setLatLng(mid(cs[0], cs[1]));
      labelBC.setLatLng(mid(cs[1], cs[2]));
      labelAB.setIcon(labelIcon(feetInches(m.sideAB)));
      labelBC.setIcon(labelIcon(feetInches(m.sideBC)));
      return m;
    };
    paint(corners);

    let live = corners;
    markers.forEach((mk, i) => {
      mk.on("drag", () => {
        live = dragCorner(cornersRef.current!, i, ll(mk.getLatLng()));
        paint(live);
        markers.forEach((other, j) => {
          if (j !== i) other.setLatLng([live[j].lat, live[j].lng]);
        });
      });
      mk.on("dragend", () => {
        setCorners(live);
        setApplied(false);
      });
    });
  }, [taps, corners]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMessage(null);
    setResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const places: Place[] = await res.json();
      if (places.length === 0) setMessage("No match. Try adding the town and state.");
      else if (places.length === 1) goTo(places[0]);
      else setResults(places);
    } catch {
      setMessage("Search didn't go through. Check your connection and try again.");
    } finally {
      setSearching(false);
    }
  };

  const goTo = (p: Place) => {
    const map = mapRef.current;
    if (!map) return;
    const at: [number, number] = [parseFloat(p.lat), parseFloat(p.lon)];
    pinRef.current?.remove();
    pinRef.current = L.marker(at, { icon: L.divIcon({ className: "map-pin", iconSize: [18, 18] }) }).addTo(map);
    map.setView(at, 20);
    setResults([]);
    setMessage(null);
  };

  const locate = () => {
    if (!navigator.geolocation) return setMessage("Location isn't available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 20),
      () => setMessage("Couldn't get your location. You can search for the address instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const reset = () => {
    setTaps([]);
    setCorners(null);
    setApplied(false);
  };

  const m = corners ? measureRect(corners) : null;
  const walls = m ? wallsFromRoof(m, overhang) : null;

  return (
    <div className="mapm">
      <form className="map-search" onSubmit={search}>
        <input
          type="search"
          inputMode="search"
          autoComplete="street-address"
          placeholder="Search an address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Address"
        />
        <button className="btn primary" type="submit" disabled={searching}>
          {searching ? "…" : "Go"}
        </button>
        <button className="btn" type="button" onClick={locate} aria-label="Use my location" title="Use my location">
          ◎
        </button>
      </form>
      {results.length > 0 && (
        <ul className="map-results">
          {results.map((r, i) => (
            <li key={i}>
              <button onClick={() => goTo(r)}>{r.display_name}</button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="map-msg">{message}</p>}

      <div className={`prompt ${corners ? "done" : ""}`}>
        {corners ? (
          <>Drag the corners onto the roof edges. A and B slide the long edge; C and D set the width.</>
        ) : (
          <>
            <span className="step">{taps.length + 1}/3</span>
            {TAP_PROMPTS[taps.length]}
          </>
        )}
      </div>

      <div className="map-canvas" ref={divRef} />

      {m && walls && (
        <div className="map-result">
          <div className="map-dims">
            <div>
              <span className="m-label">Roof outline</span>
              <strong>
                {feetInches(m.length)} × {feetInches(m.span)}
              </strong>
              <span className="m-sub">{Math.round(m.area).toLocaleString()} sf</span>
            </div>
            <div>
              <span className="m-label">Walls (est.)</span>
              <strong>
                {feetInches(walls.length)} × {feetInches(walls.span)}
              </strong>
              <span className="m-sub">{Math.round(walls.length * walls.span).toLocaleString()} sf footprint</span>
            </div>
          </div>
          <label className="slider">
            <span className="slider-top">
              <span>Eave overhang to remove (each side)</span>
              <strong>{feetInches(overhang)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.25}
              value={overhang}
              onChange={(e) => {
                setOverhang(Number(e.target.value));
                setApplied(false);
              }}
            />
          </label>
          <div className="photo-actions">
            <button
              className="btn primary"
              onClick={() => {
                onApply({ length: round(walls.length), span: round(walls.span) });
                setApplied(true);
              }}
            >
              {applied ? "Applied ✓" : "Use these dimensions"}
            </button>
            <button className="btn" onClick={reset}>
              Start over
            </button>
          </div>
          <p className="hint map-hint">
            Satellite photos can lean a little and roofs hide the walls, so treat this as a close estimate and check one
            wall with a tape.
          </p>
        </div>
      )}
      {!corners && taps.length > 0 && (
        <div className="photo-actions">
          <button className="btn" onClick={reset}>
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 4) / 4;
}
