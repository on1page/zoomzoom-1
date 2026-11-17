// GET /api/me/overview — panoramica personale: esperienze, recensioni,
// segnalazioni, stato verifiche. Solo dati propri.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/server/auth";
import { handleError } from "@/lib/server/http";

export async function GET() {
  try {
    const user = await requireUser();
    const exps = await db.experience.findMany({
      where: { OR: [{ userId: user.id }, { requestedById: user.id }, { clientEmail: user.email }] },
      orderBy: { createdAt: "desc" },
      include: { entity: { select: { id: true, name: true, categoryId: true } }, review: { select: { id: true, score: true, status: true, updatedAt: true } } },
    });
    const revs = await db.review.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { entity: { select: { id: true, name: true } } },
    });
    const reports = await db.report.findMany({
      where: { reporterUserId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, reason: true, status: true, createdAt: true, targetId: true },
    });
    return NextResponse.json({
      ok: true,
      experiences: exps.map(e => ({
        id: e.id, entity: e.entity, kind: e.kind, period: e.period, origin: e.origin,
        status: e.status, note: e.note, createdAt: e.createdAt.toISOString(),
        review: e.review ? { id: e.review.id, score: e.review.score, status: e.review.status } : null,
      })),
      reviews: revs.map(r => ({
        id: r.id, entity: r.entity, score: r.score, status: r.status,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt?.toISOString() || null,
        updateReason: r.updateReason,
      })),
      reports,
    });
  } catch (e) {
    return handleError(e);
  }
}
