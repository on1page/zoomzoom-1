// POST /api/admin/login — accesso area amministrativa: password + TOTP
// obbligatori, sessione separata breve (30 min di inattività), lockout.
import { NextResponse } from "next/server";
import { adminLogin } from "@/lib/server/auth";
import { guard, readJson, handleError, fail } from "@/lib/server/http";

export async function POST(req: Request) {
  try {
    guard(req, "admin-login", 8, 600);
    const p = await readJson<{ email?: string; password?: string; code?: string; hp?: string }>(req);
    if (String(p.hp || "").trim()) return fail("Richiesta rifiutata.", 400);
    const res = await adminLogin(String(p.email || ""), String(p.password || ""), String(p.code || ""));
    if (!res.ok) {
      if (res.error === "locked") return fail("Troppi tentativi: accesso bloccato per 60 secondi.", 429);
      if (res.error === "totp") return fail("Codice a tempo non valido.", 401, { field: "totp" });
      if (res.error === "totpMissing") return fail("Questo account staff non ha la 2FA attiva: contatta il super amministratore.", 403);
      if (res.error === "notStaff") return fail("Questo account non è abilitato all'area amministrativa.", 403);
      return fail("Credenziali non valide.", 401, { field: "password" });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
