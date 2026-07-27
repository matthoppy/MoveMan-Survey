import { NextResponse } from "next/server";
import { getSurvey } from "@/lib/db";
import { REMOVALS_PROMPT, isTranscriptionConfigured, transcribeAudio } from "@/lib/transcribe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/** 25 MB is the ceiling most transcription APIs impose. */
const MAX_CHUNK_BYTES = 25 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({ configured: isTranscriptionConfigured() });
}

/**
 * Transcribes one chunk of audio extracted from a survey video.
 *
 * Stateless by design — audio in, text out. The browser sends chunks in order
 * and stitches the results, so a long survey is just several calls and a
 * failure part-way through doesn't corrupt the stored transcript.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getSurvey(id)) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  if (!isTranscriptionConfigured()) {
    return NextResponse.json(
      { error: "Transcription is not configured. Set TRANSCRIPTION_API_KEY to enable it." },
      { status: 501 },
    );
  }

  const audio = await request.blob();
  if (audio.size === 0) {
    return NextResponse.json({ error: "No audio was sent." }, { status: 400 });
  }
  if (audio.size > MAX_CHUNK_BYTES) {
    return NextResponse.json(
      { error: `Audio chunk is ${Math.round(audio.size / 1024 / 1024)} MB, over the 25 MB limit.` },
      { status: 413 },
    );
  }

  try {
    const text = await transcribeAudio({ audio, prompt: REMOVALS_PROMPT });
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 502 },
    );
  }
}
