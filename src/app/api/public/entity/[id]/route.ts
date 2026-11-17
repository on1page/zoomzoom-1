// GET /api/public/entity/[id] — scheda pubblica: entità, recensioni, criteri.
// Le recensioni nascoste dalla moderazione restano escluse dalle medie e
// l'elenco mostra solo il conteggio delle nascoste.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCategory } from "@/lib/server/categories";
import { getSettings } from "@/lib/server/settings";
import { publicEntity, publicReviewsForEntity } from "@/lib/server/public-data";
import { handleError } from "@/lib/server/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const settings = await getSettings();
    const ent = await db.entity.findUnique({ where: { id } });
    if (!ent || ent.status !== "published") {
      return NextResponse.json({ ok: false, error: "Scheda non trovata." }, { status: 404 });
    }
    const cat = await getCategory(ent.categoryId);
    const [pub, reviews] = await Promise.all([
      publicEntity(id, settings.minReviews),
      publicReviewsForEntity(id),
    ]);
    const published = reviews.filter(r => r.status === "published");
    const hiddenCount = reviews.length - published.length;
    return NextResponse.json({
      ok: true,
      entity: pub,
      category: cat,
      reviews: published,
      hiddenCount,
      settings: { minReviews: settings.minReviews, rettificaDays: settings.rettificaDays },
    });
  } catch (e) {
    return handleError(e);
  }
}
