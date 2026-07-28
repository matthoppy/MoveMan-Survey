import { NextResponse } from "next/server";
import { getRateCard, saveRateCard } from "@/lib/db";
import { DEFAULT_RATE_CARD } from "@/lib/pricing";
import { rateCardSchema } from "@/lib/pricing/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const card = await getRateCard();
  // `configured: false` is what the UI uses to warn that a quote is being
  // produced from example figures rather than the company's own.
  return NextResponse.json({ rateCard: card ?? DEFAULT_RATE_CARD, configured: card !== null });
}

export async function PUT(request: Request) {
  const parsed = rateCardSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: `${issue?.path.join(".") || "rate card"}: ${issue?.message ?? "invalid"}` },
      { status: 400 },
    );
  }

  try {
    const saved = await saveRateCard(parsed.data);
    return NextResponse.json({ rateCard: saved, configured: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the rate card." },
      { status: 400 },
    );
  }
}
