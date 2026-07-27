import { NextResponse } from "next/server";
import { z } from "zod";
import { getSurvey, updateSurvey } from "@/lib/db";
import { analyseSurvey, isAiConfigured } from "@/lib/analysis";
import { withSurveyEstimate } from "@/lib/survey-view";
import type { AccessDetails } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  /** Base64 JPEG frames sampled from the video in the browser, chronological. */
  frames: z.array(z.string()).max(60).default([]),
  transcript: z.string().max(200_000).optional(),
  durationSec: z.number().min(0).nullable().optional(),
  /** Keep any items the surveyor added by hand instead of wiping the inventory. */
  keepManualItems: z.boolean().default(true),
  /** Apply the access details the analyser inferred from the video. */
  applyAccessSuggestion: z.boolean().default(false),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const survey = getSurvey(id);
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { frames, keepManualItems, applyAccessSuggestion } = parsed.data;
  const transcript = parsed.data.transcript ?? survey.transcript;

  if (frames.length === 0 && !transcript.trim()) {
    return NextResponse.json(
      { error: "Nothing to analyse — no video frames were supplied and there is no narration transcript." },
      { status: 400 },
    );
  }

  updateSurvey(id, { status: "analysing" });

  try {
    const result = await analyseSurvey({
      frames,
      transcript,
      durationSec: parsed.data.durationSec ?? null,
      propertyNotes: buildPropertyNotes(survey.originAddress, survey.destinationAddress),
    });

    const manualItems = keepManualItems ? survey.items.filter((item) => item.source === "manual") : [];

    // Rooms an operator added by hand keep their packing level; the analyser
    // must not quietly downgrade a room someone already priced for packing.
    const analysedRooms = new Map(result.rooms.map((r) => [r.name, r]));
    for (const existing of survey.rooms) {
      const incoming = analysedRooms.get(existing.name);
      if (incoming && existing.packingLevel !== "none" && incoming.packingLevel === "none") {
        analysedRooms.set(existing.name, { ...incoming, packingLevel: existing.packingLevel });
      }
    }

    const patch: Parameters<typeof updateSurvey>[1] = {
      items: [...result.items, ...manualItems],
      rooms: [...analysedRooms.values()],
      transcript,
      analysisSummary: result.summary,
      analysisFlags: result.flags,
      analysisModel: result.model,
      analysedAt: new Date().toISOString(),
      status: "analysed",
    };

    if (applyAccessSuggestion && result.accessSuggestion) {
      patch.origin = { ...survey.origin, ...result.accessSuggestion } as AccessDetails;
    }

    const updated = updateSurvey(id, patch)!;

    return NextResponse.json({
      survey: withSurveyEstimate(updated),
      offline: result.offline,
      accessSuggestion: result.accessSuggestion,
    });
  } catch (error) {
    updateSurvey(id, { status: "failed" });
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ aiConfigured: isAiConfigured() });
}

function buildPropertyNotes(origin: string, destination: string): string | undefined {
  const parts: string[] = [];
  if (origin.trim()) parts.push(`Collection address: ${origin.trim()}`);
  if (destination.trim()) parts.push(`Delivery address: ${destination.trim()}`);
  return parts.length ? parts.join("\n") : undefined;
}
