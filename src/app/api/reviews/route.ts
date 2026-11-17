// POST /api/reviews — pubblicazione recensione su un'esperienza attiva
// collegata all'utente. Transazione atomica: il vincolo UNIQUE su
// experienceId nel DB impedisce duplicati anche sotto richieste concorrenti.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/server/auth";
import { getCategory, snapshotCategoryVersion } from "@/lib/server/categories";
import { validateReviewPayload, type ReviewPayload } from "@/lib/server/validation";
import { guard, readJson, handleError, fail } from "@/lib/server/http";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user.emailVerified) return fail("Conferma prima l'indirizzo email dal collegamento ricevuto via email.", 403);
    guard(req, "review", 10, 3600);
    const p = await readJson<ReviewPayload & { experienceId?: string }>(req);
    const expId = String(p.experienceId || "");
    const exp = await db.experience.findUnique({ where: { id: expId }, include: { entity: true } });
    if (!exp || exp.status !== "active" || exp.userId !== user.id) {
      return fail("Questa esperienza non è attiva o non è collegata al tuo account.", 403);
    }
    const existing = await db.review.findUnique({ where: { experienceId: expId } });
    if (existing) return fail("Hai già scritto questa recensione: puoi aggiornarla con una rettifica motivata.", 409);

    const cat = await getCategory(exp.entity.categoryId);
    if (!cat) return fail("Categoria non trovata.", 400);
    const val = validateReviewPayload(p, cat);
    if (!val.ok) return fail(val.error);

    const versionId = await snapshotCategoryVersion(cat.id);
    const review = await db.review.create({
      data: {
        experienceId: exp.id, entityId: exp.entityId, userId: user.id,
        score: val.score, criteriaJson: JSON.stringify(val.criteria), criteriaVersionId: versionId,
        prosJson: JSON.stringify(val.pros), consJson: JSON.stringify(val.cons),
        priceAmount: val.price?.amount ?? null, priceUnit: val.price?.unit ?? null, priceKind: val.price?.kind ?? null,
        text: val.text, status: "published", verified: true, isDemo: exp.isDemo,
      },
    });
    return NextResponse.json({ ok: true, reviewId: review.id, entityId: exp.entityId });
  } catch (e) {
    // violazione dell'unique su experienceId: richiesta concorrente già servita
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return fail("Hai già scritto questa recensione.", 409);
    }
    return handleError(e);
  }
}
