import { NextResponse } from "next/server";
import { z } from "zod";
import { getSurveyByToken, updateSurvey } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const schema = z.object({
  transcript: z.string().max(200_000),
  /** Append to whatever is already stored rather than replacing it. */
  append: z.boolean().optional(),
});

/** Stores the live speech-to-text captured while the customer narrates. */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const survey = await getSurveyByToken(token);
  if (!survey) {
    return NextResponse.json({ error: "This survey link is not valid." }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transcript payload" }, { status: 400 });
  }

  const transcript = parsed.data.append
    ? `${survey.transcript}${survey.transcript ? " " : ""}${parsed.data.transcript}`.trim()
    : parsed.data.transcript;

  await updateSurvey(survey.id, { transcript });
  return NextResponse.json({ ok: true, length: transcript.length });
}
