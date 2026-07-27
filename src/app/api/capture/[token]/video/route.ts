import { NextResponse } from "next/server";
import { getSurveyByToken } from "@/lib/db";
import { isSupportedVideoType, storeUpload } from "@/lib/video-upload";
import type { CaptureMode } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Uploads are streamed to disk, so give a long-running capture room to finish. */
export const maxDuration = 300;

type Params = { params: Promise<{ token: string }> };

/**
 * Receives survey video from the customer's browser.
 *
 * The body is the raw video bytes. Metadata rides on headers so nothing has
 * to be buffered to parse a multipart envelope:
 *   content-type      the video MIME type
 *   x-capture-mode    upload | recorded | live
 *   x-duration-sec    length in seconds, if the client knows it
 *   x-video-id        append to this recording instead of starting a new one
 *   x-complete        "0" while a live capture is still running
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const survey = getSurveyByToken(token);
  if (!survey) {
    return NextResponse.json({ error: "This survey link is not valid." }, { status: 404 });
  }

  const mimeType = request.headers.get("content-type") ?? "";
  if (!isSupportedVideoType(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported video format "${mimeType || "unknown"}". Send MP4, WebM, MOV or MKV.` },
      { status: 415 },
    );
  }

  const mode = (request.headers.get("x-capture-mode") ?? "upload") as CaptureMode;
  const durationHeader = request.headers.get("x-duration-sec");
  const durationSec = durationHeader ? Number(durationHeader) : null;
  const videoId = request.headers.get("x-video-id");
  const complete = request.headers.get("x-complete") !== "0";

  try {
    const video = await storeUpload({
      survey,
      body: request.body,
      mimeType,
      mode: ["upload", "recorded", "live"].includes(mode) ? mode : "upload",
      durationSec: Number.isFinite(durationSec) && durationSec! > 0 ? durationSec : null,
      videoId,
      complete,
    });
    return NextResponse.json({ video });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
