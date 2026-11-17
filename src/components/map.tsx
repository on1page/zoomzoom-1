"use client";
// ZoomZoom — mappa schematica interattiva (fedele al prototipo): pan con
// trascinamento, zoom con rotella/pulsanti/tastiera, zona di riferimento
// salvata come preferenza tecnica, GPS solo su richiesta esplicita
// (le coordinate servono al momento e vengono scartate).
// Privacy: punti solo per immobili; zone solo con aggregati sopra soglia;
// mai persone geolocalizzate, mai dati di autori o date.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmt1 } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { navigate } from "@/lib/client/router";
import { DemoChip, ScoreLine, Stars, ChipCat } from "./ui-kit";

type MapData = {
  demoMode: boolean;
  notice: string;
  zones: Array<{
    id: string; name: string; poly: string; lx: number; ly: number;
    gps: { lat: number; lng: number };
    aggregate: { mean: number; n: number; sufficient: boolean } | null;
    suppressed: boolean; entityId: string | null;
  }>;
  markers: Array<{ id: string; name: string; x: number; y: number; mean: number | null; n: number; isDemo: boolean }>;
  thresholds: { mapMinAggregate: number; minReviews: number };
};

export function scoreBandColor(v: number | null): string {
  if (v == null) return "#9AA4AE";
  if (v >= 8) return "#2C6E49";
  if (v >= 6) return "#C9A227";
  if (v >= 4) return "#C07A2D";
  return "#A63A2B";
}

const MAP_BG = {
  river: "M 40,140 C220,180 300,300 420,340 C 560,385 660,330 760,400 C830,448 900,470 960,500",
  park: { cx: 560, cy: 548, rx: 130, ry: 52 },
  streets: ["M60,250 L940,250", "M80,420 L920,420", "M380,40 L380,600", "M700,60 L700,620", "M120,540 L880,540", "M520,60 L520,600"],
  minor: ["M240,120 L240,560", "M840,60 L840,400", "M60,160 L900,320", "M160,480 L880,480"],
};

export function MapViewport({ mode = "immobili", activeZone }: { mode?: "immobili" | "zone"; activeZone?: string }) {
  const { boot, myZone, setMyZone, toast } = useApp();
  const [data, setData] = useState<MapData | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const moved = useRef(false);
  const [popup, setPopup] = useState<{ marker: MapData["markers"][0]; leftPct: number; topPct: number } | null>(null);

  useEffect(() => {
    void api<MapData>("/api/public/map").then(res => { if (res.ok) setData(res); });
  }, []);

  const apply = useCallback(() => {
    const holder = holderRef.current, canvas = canvasRef.current;
    if (!holder || !canvas) return;
    const W = holder.clientWidth || 1, H = holder.clientHeight || 1;
    const v = view.current;
    v.k = Math.min(5, Math.max(1, v.k));
    if (v.k <= 1.001) { v.k = 1; v.x = 0; v.y = 0; }
    v.x = Math.min(0, Math.max(W - W * v.k, v.x));
    v.y = Math.min(0, Math.max(H - H * v.k, v.y));
    canvas.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  }, []);

  const setAnim = useCallback((on: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.classList.toggle("anim", on);
    if (on) setTimeout(() => canvas.classList.remove("anim"), 420);
  }, []);

  const zoomBy = useCallback((f: number, cx?: number, cy?: number, animate = false) => {
    const holder = holderRef.current;
    if (!holder) return;
    if (animate) setAnim(true);
    const W = holder.clientWidth || 1, H = holder.clientHeight || 1;
    if (cx == null) cx = W / 2;
    if (cy == null) cy = H / 2;
    const v = view.current;
    const k2 = Math.min(5, Math.max(1, v.k * f));
    const r = k2 / v.k;
    v.x = cx - (cx - v.x) * r;
    v.y = cy - (cy - v.y) * r;
    v.k = k2;
    setPopup(null);
    apply();
  }, [apply, setAnim]);

  const panBy = useCallback((dx: number, dy: number, animate = false) => {
    if (animate) setAnim(true);
    view.current.x += dx;
    view.current.y += dy;
    setPopup(null);
    apply();
  }, [apply, setAnim]);

  const reset = useCallback((animate = true) => {
    if (animate) setAnim(true);
    view.current = { x: 0, y: 0, k: 1 };
    setPopup(null);
    apply();
  }, [apply, setAnim]);

  const zoneBBox = useCallback((zoneId: string) => {
    const z = data?.zones.find(zz => zz.id === zoneId);
    if (!z) return null;
    const pts = z.poly.split(" ").map(p => p.split(",").map(Number));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }, [data]);

  const focusZone = useCallback((zoneId: string, animate = true) => {
    const b = zoneBBox(zoneId);
    const holder = holderRef.current;
    if (!b || !holder || holder.clientWidth < 50) return;
    if (animate) setAnim(true);
    const W = holder.clientWidth, H = holder.clientHeight;
    const k = Math.min(5, Math.max(1, 0.85 * Math.min(1000 / b.w, 640 / b.h)));
    const v = view.current;
    v.k = k;
    v.x = W / 2 - (b.cx / 1000) * W * k;
    v.y = H / 2 - (b.cy / 640) * H * k;
    setPopup(null);
    apply();
  }, [apply, setAnim, zoneBBox]);

  // vista iniziale: zona attiva o zona di riferimento
  useEffect(() => {
    if (data) {
      const initial = activeZone || myZone;
      if (initial && data.zones.some(z => z.id === initial)) focusZone(initial, false);
    }
  }, [data]);

  // interazioni pointer / wheel / tastiera
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const onPointerDown = (ev: PointerEvent) => {
      if ((ev.target as HTMLElement).closest("select, button, a, .map-popup")) return;
      drag.current = { x: ev.clientX, y: ev.clientY, vx: view.current.x, vy: view.current.y };
      moved.current = false;
      try { holder.setPointerCapture(ev.pointerId); } catch { /* pointer non catturabile */ }
      holder.classList.add("dragging");
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!drag.current) return;
      const dx = ev.clientX - drag.current.x, dy = ev.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
      if (moved.current) {
        view.current.x = drag.current.vx + dx;
        view.current.y = drag.current.vy + dy;
        setPopup(null);
        apply();
      }
    };
    const endDrag = () => {
      drag.current = null;
      holder.classList.remove("dragging");
      setTimeout(() => { moved.current = false; }, 0);
    };
    const onClickCapture = (ev: Event) => {
      if (moved.current) { ev.stopPropagation(); ev.preventDefault(); }
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = holder.getBoundingClientRect();
      zoomBy(Math.pow(1.0015, -ev.deltaY), ev.clientX - r.left, ev.clientY - r.top);
    };
    const onDbl = (ev: MouseEvent) => {
      if ((ev.target as HTMLElement).closest("select, button, a, .map-popup")) return;
      const r = holder.getBoundingClientRect();
      zoomBy(1.6, ev.clientX - r.left, ev.clientY - r.top, true);
    };
    const onKey = (ev: KeyboardEvent) => {
      const step = ev.shiftKey ? 160 : 60;
      switch (ev.key) {
        case "ArrowLeft": panBy(step, 0, true); ev.preventDefault(); break;
        case "ArrowRight": panBy(-step, 0, true); ev.preventDefault(); break;
        case "ArrowUp": panBy(0, step, true); ev.preventDefault(); break;
        case "ArrowDown": panBy(0, -step, true); ev.preventDefault(); break;
        case "+": case "=": zoomBy(1.3, undefined, undefined, true); ev.preventDefault(); break;
        case "-": case "_": zoomBy(1 / 1.3, undefined, undefined, true); ev.preventDefault(); break;
        case "0": case "Home": reset(true); ev.preventDefault(); break;
        case "Escape": setPopup(null); break;
      }
    };
    holder.addEventListener("pointerdown", onPointerDown);
    holder.addEventListener("pointermove", onPointerMove);
    holder.addEventListener("pointerup", endDrag);
    holder.addEventListener("pointercancel", endDrag);
    holder.addEventListener("click", onClickCapture, true);
    holder.addEventListener("wheel", onWheel, { passive: false });
    holder.addEventListener("dblclick", onDbl);
    holder.addEventListener("keydown", onKey);
    return () => {
      holder.removeEventListener("pointerdown", onPointerDown);
      holder.removeEventListener("pointermove", onPointerMove);
      holder.removeEventListener("pointerup", endDrag);
      holder.removeEventListener("pointercancel", endDrag);
      holder.removeEventListener("click", onClickCapture);
      holder.removeEventListener("wheel", onWheel);
      holder.removeEventListener("dblclick", onDbl);
      holder.removeEventListener("keydown", onKey);
    };
  }, [apply, panBy, reset, zoomBy]);

  const useGps = () => {
    if (!navigator.geolocation || !data) {
      toast("Geolocalizzazione non disponibile in questo browser: scegli la zona dall'elenco.", "err");
      return;
    }
    toast("Rilevo la posizione… le coordinate servono solo al momento e non vengono salvate.");
    navigator.geolocation.getCurrentPosition(
      pos => {
        // zona più vicina tra quelle della mappa (città demo: distanza locale)
        const R = 6371, rad = Math.PI / 180;
        const m = Math.cos(pos.coords.latitude * rad);
        let best: MapData["zones"][0] | null = null, bd = Infinity;
        for (const z of data.zones) {
          const dLat = (z.gps.lat - pos.coords.latitude) * rad;
          const dLng = (z.gps.lng - pos.coords.longitude) * rad;
          const d = R * Math.sqrt(dLat * dLat + (dLng * m) * (dLng * m));
          if (d < bd) { bd = d; best = z; }
        }
        if (best) {
          setMyZone(best.id);
          focusZone(best.id, true);
          toast(`Zona di riferimento: ${best.name}${data.demoMode ? " (città di esempio)" : ""}. Coordinate scartate.`);
        }
      },
      err => {
        const why = err.code === 1 ? "autorizzazione negata" : err.code === 2 ? "posizione non disponibile" : "tempo scaduto";
        toast(`GPS non utilizzabile (${why}): scegli la zona dall'elenco a sinistra.`, "err");
      },
      { timeout: 8000, maximumAge: 600000, enableHighAccuracy: false }
    );
  };

  if (!data) {
    return <div className="map-viewport" role="application" aria-label="Mappa in caricamento"><div className="map-canvas-wrap"></div></div>;
  }

  const openMarker = (m: MapData["markers"][0]) => {
    const holder = holderRef.current;
    if (!holder) return;
    const W = holder.clientWidth || 1, H = holder.clientHeight || 1;
    const v = view.current;
    setPopup({
      marker: m,
      leftPct: ((m.x / 1000) * W * v.k + v.x) / W * 100,
      topPct: ((m.y / 640) * H * v.k + v.y) / H * 100,
    });
  };

  return (
    <div className="map-viewport" tabIndex={0} role="application" ref={holderRef}
      aria-label="Mappa interattiva di Valserrana (città di esempio). Usa le frecce per spostare la vista, i tasti più e meno per lo zoom e zero per la vista di insieme. I punti immobile aprono una scheda sintetica, le zone portano alla loro pagina.">
      <div className="map-loc">
        <span aria-hidden="true">◎</span>
        <select className="map-zone-select" aria-label="La tua zona di riferimento"
          value={myZone || ""}
          onChange={e => {
            const zid = e.target.value || null;
            setMyZone(zid);
            if (zid) {
              focusZone(zid, true);
              toast("Zona di riferimento: " + (data.zones.find(z => z.id === zid)?.name || "") + ". Preferenza salvata solo su questo dispositivo.");
            } else {
              reset(true);
              toast("Zona di riferimento rimossa.");
            }
          }}>
          <option value="">La tua zona…</option>
          {data.zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <button className="btn btn-ghost btn-xs" onClick={useGps}
          title="Usa la mia posizione: le coordinate servono solo al momento e non vengono salvate">GPS</button>
      </div>
      <div className="map-canvas-wrap" ref={canvasRef}>
        <svg className="map-svg" viewBox="0 0 1000 640" role="group"
          aria-label="Mappa schematica della città fittizia Valserrana con punteggi aggregati">
          <path className="river" d={MAP_BG.river} aria-hidden="true" />
          <ellipse className="park" cx={MAP_BG.park.cx} cy={MAP_BG.park.cy} rx={MAP_BG.park.rx} ry={MAP_BG.park.ry} aria-hidden="true" />
          {MAP_BG.streets.map((d, i) => <path className="street" d={d} key={i} aria-hidden="true" />)}
          {MAP_BG.minor.map((d, i) => <path className="street minor" d={d} key={i} aria-hidden="true" />)}
          {data.zones.map(z => (
            <g key={z.id}>
              <polygon
                className={`zone-shape${activeZone === z.id ? " active" : ""}${myZone === z.id ? " mine" : ""}`}
                points={z.poly}
                tabIndex={0}
                role="button"
                aria-label={`Apri la scheda della zona ${z.name}${z.suppressed ? " (aggregati non disponibili: pochi dati)" : z.aggregate ? `: media ${fmt1(z.aggregate.mean)} su 10, ${z.aggregate.n} recensioni` : ""}`}
                onClick={() => {
                  if (moved.current) return;
                  if (activeZone && activeZone === z.id) return;
                  if (z.entityId) navigate(`#/zona/${z.entityId}`);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && !(activeZone && activeZone === z.id)) {
                    if (z.entityId) navigate(`#/zona/${z.entityId}`);
                  }
                }}
              />
              <text className="zone-label" x={z.lx} y={z.ly - 10} textAnchor="middle">{z.name}</text>
              {z.aggregate ? (
                <text className="zone-score" x={z.lx} y={z.ly + 13} textAnchor="middle"
                  fill={scoreBandColor(z.aggregate.mean)}>
                  {fmt1(z.aggregate.mean)}/10 · {z.aggregate.n}{z.aggregate.sufficient ? "" : " (dati pochi)"}
                </text>
              ) : (
                <text className="zone-score" x={z.lx} y={z.ly + 13} textAnchor="middle" fill="#8B95A0">
                  {z.suppressed ? "aggregati sospesi (pochi dati)" : "n. d."}
                </text>
              )}
            </g>
          ))}
          {mode !== "zone" && data.markers.map(m => (
            <g className="map-marker" key={m.id} tabIndex={0} role="button"
              aria-label={`${m.name}: ${m.mean == null ? "nessuna recensione" : `${fmt1(m.mean)} su 10`}`}
              onClick={() => { if (!moved.current) openMarker(m); }}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMarker(m); } }}>
              <circle className="dot" cx={m.x} cy={m.y} r={10 + Math.min(7, m.n)} fill={scoreBandColor(m.mean)} />
              <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
                {m.mean == null ? "–" : fmt1(m.mean).replace(",0", "")}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {popup ? (
        <div className="map-popup-holder">
          <div className="map-popup" style={{ left: `${popup.leftPct}%`, top: `${popup.topPct}%`, transform: "translate(-50%,-115%)" }}>
            <button className="modal-close" onClick={() => setPopup(null)} aria-label="Chiudi"
              style={{ position: "absolute", top: 4, right: 6 }}>×</button>
            <h4>{popup.marker.name} {popup.marker.isDemo ? <DemoChip /> : null}</h4>
            <p className="muted" style={{ fontSize: ".8rem" }}>Immobile · {data.zones.find(z => z.id === (myZone || ""))?.name || "Valserrana"}</p>
            <ScoreLine stats={{ n: popup.marker.n, mean: popup.marker.mean, sufficient: popup.marker.n >= data.thresholds.minReviews }} />
            <a className="btn btn-primary btn-sm mt1" href={`#/scheda/${popup.marker.id}`}>Apri la scheda</a>
          </div>
        </div>
      ) : null}
      <div className="map-zoomctl">
        <button type="button" onClick={() => zoomBy(1.3, undefined, undefined, true)} aria-label="Zoom avanti">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.3, undefined, undefined, true)} aria-label="Zoom indietro">−</button>
        <button type="button" onClick={() => reset(true)} aria-label="Vista di insieme (zero)">⤢</button>
      </div>
      <span className="map-kbd-hint small muted">Trascina · rotella o +/− per lo zoom · frecce per esplorare · 0 per reimpostare</span>
    </div>
  );
}

export function MapLegend() {
  return (
    <div className="map-legend">
      <span className="leg-dot" style={{ background: scoreBandColor(9) }}></span> 8–10 ottimo
      <span className="leg-dot" style={{ background: scoreBandColor(7) }}></span> 6–8 discreto
      <span className="leg-dot" style={{ background: scoreBandColor(5) }}></span> 4–6 criticità
      <span className="leg-dot" style={{ background: scoreBandColor(2) }}></span> 0–4 gravi criticità
      <span className="small muted">Clicca un punto o una zona: la dimensione del punto cresce con le recensioni.</span>
    </div>
  );
}
