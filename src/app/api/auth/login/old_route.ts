// POST /api/auth/login — accesso area pubblica (fattore 1; se 2FA attiva
// il client deve completare con /api/auth/login-2fa nella stessa richiesta logica).
import { NextResponse } from "next/server";
import { publicLogin } from "@/lib/server/auth";
import { guard, readJson, handleError, fail } from "@/lib/server/http";

export async function POST(req: Request) {
  try {
    guard(req, "login", 12, 600);
    const p = await readJson<{ email?: string; password?: string; hp?: string }>(req);
    if (String(p.hp || "").trim()) return fail("Richiesta rifiutata.", 400);
    const res = await publicLogin(String(p.email || ""), String(p.password || ""), "ip");
    if (res.error === "invalid") return fail("Credenziali non valide.", 401);
    if (res.error === "locked") return fail("Troppi tentativi: accesso bloccato per 60 secondi.", 429);
    if (res.error === "disabled") return fail("Account sospeso: contatta la moderazione.", 403);
    if (res.error === "staffOnly") return fail("Questo account è riservato all'area amministrativa.", 403);
    return NextResponse.json({ ok: true, needs2fa: "needs2fa" in res });
  } catch (e) {
    return handleError(e);
  }
}
