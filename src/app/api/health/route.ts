import fs from "node:fs";
import { NextResponse } from "next/server";
import { videoDir } from "@/lib/paths";
import { configuredStorage, storageChoice } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/db";
import { isAiConfigured } from "@/lib/analysis";
import { companyIdentity } from "@/lib/company";
import { retentionDays } from "@/lib/retention";

export const dynamic = "force-dynamic";

/**
 * What the host polls, and what to look at first when something is wrong.
 *
 * Reports rather than asserts, with one exception: writable disk is checked
 * for real. A container that has lost its volume still serves pages perfectly
 * and silently fails to keep a single recording, because chunks are staged on
 * disk while the customer films — exactly the kind of fault a health check
 * exists to catch before a customer does.
 *
 * No credentials, no counts of anybody's data — this is reachable by the
 * platform, so it says whether things are configured, never what they are.
 */
export async function GET() {
  const checks: Record<string, unknown> = {
    supabase: isSupabaseConfigured() ? "configured" : "local sqlite",
    videoStorage: storageChoice() === "supabase" ? "supabase bucket" : "local disk",
    // Echoed back so a setting that did not take — a typo, stray quotes, a
    // deploy that never picked it up — can be told apart from one that did.
    videoStorageSetting: configuredStorage(),
    // Named because it is the ceiling people meet first: a Supabase project
    // caps a single object by plan, and 50 MB is under three minutes of video.
    videoStorageNote:
      storageChoice() === "supabase"
        ? "one object per video — check the project's storage size limit covers a full survey"
        : "no size ceiling beyond the volume",
    ai: isAiConfigured() ? "configured" : "transcript-only fallback",
    transcription: process.env.TRANSCRIPTION_API_KEY ? "configured" : "browser only",
    retentionDays: retentionDays(),
    retentionPurge: process.env.RETENTION_PURGE_TOKEN ? "enabled" : "DISABLED",
    privacyNotice: companyIdentity().configured ? "complete" : "INCOMPLETE",
  };

  let ok = true;

  try {
    const probe = `${videoDir()}/.health-${process.pid}`;
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe);
    checks.writableDisk = true;
  } catch (error) {
    ok = false;
    checks.writableDisk = false;
    checks.diskError =
      error instanceof Error ? error.message : "the video directory is not writable";
  }

  return NextResponse.json({ ok, ...checks }, { status: ok ? 200 : 503 });
}
