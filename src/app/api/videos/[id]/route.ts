import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { deleteVideo, getSurvey, getVideo } from "@/lib/db";
import { deleteVideoFile } from "@/lib/video-upload";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Streams a stored survey video, honouring Range requests so the surveyor can
 * scrub through it rather than waiting for the whole file to download.
 *
 * When the file has been moved to object storage the browser is redirected to
 * a short-lived signed URL, so the video never passes through this process.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;

  const video = await getVideo(id);
  if (!video) return new NextResponse("Not found", { status: 404 });

  // Authorisation rides on the parent survey: with Supabase configured this
  // read runs under row-level security, so a survey the caller cannot see
  // comes back empty and the video with it.
  if (!(await getSurvey(video.surveyId))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const resolved = await getStorage().resolve(video.filename, video.mimeType);

  if (resolved.kind === "missing") {
    return new NextResponse("Video file is missing from storage", { status: 410 });
  }

  if (resolved.kind === "redirect") {
    return NextResponse.redirect(resolved.url, 307);
  }

  const { path: file, sizeBytes: size } = resolved;
  const range = request.headers.get("range");

  const headers = new Headers({
    "Content-Type": video.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });

  if (!range) {
    headers.set("Content-Length", String(size));
    return new NextResponse(toWebStream(fs.createReadStream(file)), { status: 200, headers });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) {
    headers.set("Content-Range", `bytes */${size}`);
    return new NextResponse("Malformed Range header", { status: 416, headers });
  }

  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : size - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    headers.set("Content-Range", `bytes */${size}`);
    return new NextResponse("Requested range not satisfiable", { status: 416, headers });
  }

  const clampedEnd = Math.min(end, size - 1);
  headers.set("Content-Range", `bytes ${start}-${clampedEnd}/${size}`);
  headers.set("Content-Length", String(clampedEnd - start + 1));

  return new NextResponse(toWebStream(fs.createReadStream(file, { start, end: clampedEnd })), {
    status: 206,
    headers,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  const video = await getVideo(id);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getSurvey(video.surveyId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteVideoFile(video);
  await deleteVideo(id);

  return NextResponse.json({ ok: true });
}

function toWebStream(stream: fs.ReadStream): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}
