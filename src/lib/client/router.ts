"use client";
// ZoomZoom — hash router minimale per la SPA a route unica.
import { useCallback, useEffect, useState } from "react";

export type Route = { segs: string[]; params: Record<string, string>; hash: string };

export function parseHash(hRaw: string): Route {
  const h = hRaw || "#/";
  const parts = h.slice(1).split("?");
  const segs = parts[0].split("/").filter(Boolean);
  const params: Record<string, string> = {};
  if (parts[1]) {
    for (const kv of parts[1].split("&")) {
      const p = kv.split("=");
      if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
    }
  }
  return { segs, params, hash: h };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(typeof window === "undefined" ? "#/" : window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(hash: string) {
  if (typeof window === "undefined") return;
  window.location.hash = hash;
}

export function useNavigate() {
  return useCallback((hash: string) => navigate(hash), []);
}
