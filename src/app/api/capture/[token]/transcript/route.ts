import { NextResponse } from "next/server";
import { z } from "zod";
import { getSurveyByToken, setTranscriptByToken } from "@/lib/db";

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

  await setTranscriptByToken(token, parsed.data.transcript, parsed.data.append ?? false);
  return NextResponse.json({ ok: true });
}
