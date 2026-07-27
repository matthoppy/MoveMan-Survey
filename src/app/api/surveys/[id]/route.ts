import { NextResponse } from "next/server";
import { deleteSurvey, getSurvey, updateSurvey } from "@/lib/db";
import { surveyPatchSchema } from "@/lib/validation";
import { withSurveyEstimate } from "@/lib/survey-view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const survey = getSurvey(id);
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  return NextResponse.json({ survey: withSurveyEstimate(survey) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getSurvey(id)) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = surveyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const updated = updateSurvey(id, parsed.data);
  return NextResponse.json({ survey: withSurveyEstimate(updated!) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  deleteSurvey(id);
  return NextResponse.json({ ok: true });
}
