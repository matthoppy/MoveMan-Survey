import { NextResponse } from "next/server";
import { getSurvey } from "@/lib/db";
import { isSupportedVideoType, storeUpload, UploadTruncatedError } from "@/lib/video-upload";
import type { CaptureMode } from "@/lib/types";

function contentLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Internal upload — used when the customer emails a video over and the office
 * attaches it themselves. Same contract as the public capture endpoint.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

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

  try {
    const video = await storeUpload({
      survey,
      body: request.body,
      mimeType,
      mode: ["upload", "recorded", "live"].includes(mode) ? mode : "upload",
      durationSec: Number.isFinite(durationSec) && durationSec! > 0 ? durationSec : null,
      videoId: request.headers.get("x-video-id"),
      complete: request.headers.get("x-complete") !== "0",
      expectedBytes: contentLength(request),
    });
    return NextResponse.json({ video });
  } catch (error) {
    if (error instanceof UploadTruncatedError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
