import { NextResponse } from "next/server";
import { deleteSurvey, getSurvey, listVideos, updateSurvey } from "@/lib/db";
import { deleteVideoFile } from "@/lib/video-upload";
import { surveyPatchSchema } from "@/lib/validation";
import { withSurveyEstimate } from "@/lib/survey-view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  return NextResponse.json({ survey: await withSurveyEstimate(survey) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await getSurvey(id))) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = surveyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const updated = await updateSurvey(id, parsed.data);
  return NextResponse.json({ survey: await withSurveyEstimate(updated!) });
}

/**
 * Deletes a survey and every recording attached to it.
 *
 * The database cascades the video *rows*, but nothing cascades the actual
 * files — object storage has never heard of the foreign key. Deleting the
 * survey on its own therefore leaves the footage of someone's house sitting in
 * a bucket with the only reference to it gone, which is the worst of both
 * worlds: unreachable through the app, and still there. So the blobs go first,
 * and the row only goes if they did.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  const survey = await getSurvey(id);
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  const videos = await listVideos(id);
  const stranded: string[] = [];

  for (const video of videos) {
    try {
      await deleteVideoFile(video);
    } catch {
      stranded.push(video.filename);
    }
  }

  if (stranded.length > 0) {
    return NextResponse.json(
      {
        error:
          `The survey was left in place: ${stranded.length} video file(s) could not be deleted from ` +
          `storage. Deleting the record now would leave the footage behind with no way to find it.`,
      },
      { status: 502 },
    );
  }

  await deleteSurvey(id);
  return NextResponse.json({ ok: true });
}
