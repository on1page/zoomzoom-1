// GET /api/auth/me — dati della sessione pubblica corrente.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { handleError } from "@/lib/server/http";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({
      ok: true,
      user: user ? {
        id: user.id, email: user.email, nickname: user.nickname, role: user.role,
        emailVerified: user.emailVerified, subjectEntityId: user.subjectEntityId,
        totpEnabled: user.totpEnabled, isDemo: user.isDemo, createdAt: user.createdAt.toISOString(),
      } : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
