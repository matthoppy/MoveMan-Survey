import { NextResponse } from "next/server";
import { z } from "zod";
import { createSurvey, listSurveys } from "@/lib/db";
import { accessSchema, journeySchema } from "@/lib/validation";
import { withSurveyEstimate } from "@/lib/survey-view";

export const dynamic = "force-dynamic";

export async function GET() {
  const surveys = listSurveys().map(withSurveyEstimate);
  return NextResponse.json({ surveys });
}

const createSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  clientEmail: z.string().email().or(z.literal("")).optional(),
  clientPhone: z.string().optional(),
  originAddress: z.string().optional(),
  destinationAddress: z.string().optional(),
  moveDate: z.string().nullable().optional(),
  origin: accessSchema.optional(),
  destination: accessSchema.optional(),
  journey: journeySchema.optional(),
  packingDayBefore: z.boolean().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const survey = createSurvey(parsed.data);
  return NextResponse.json({ survey: withSurveyEstimate(survey) }, { status: 201 });
}
