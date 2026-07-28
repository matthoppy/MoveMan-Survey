import { NextResponse } from "next/server";
import { getSurveyByToken, recordConsentByToken } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * Records that the customer accepted the recording notice.
 *
 * Called before the camera is allowed to start, so a refusal to store the
 * agreement is a refusal to record — see the capture page.
 */
export async function POST(_request: Request, { params }: Params) {
  const { token } = await params;
  const survey = await getSurveyByToken(token);
  if (!survey) {
    return NextResponse.json({ error: "This survey link is not valid." }, { status: 404 });
  }

  await recordConsentByToken(token);
  return NextResponse.json({ ok: true });
}
