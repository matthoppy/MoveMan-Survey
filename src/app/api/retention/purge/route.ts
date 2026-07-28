import { NextResponse } from "next/server";
import { deleteVideoAsSystem, listVideosBefore } from "@/lib/db";
import { deleteVideoFile } from "@/lib/video-upload";
import { retentionCutoff, retentionDays } from "@/lib/retention";

export const dynamic = "force-dynamic";

/**
 * Deletes survey videos past their retention window.
 *
 * Called by a scheduler, so there is no session to authorise it. It uses a
 * shared secret instead, and — importantly — refuses to run at all when that
 * secret is unset. An unauthenticated endpoint that deletes customer footage
 * is not something to leave open by default, and failing closed means a
 * missing environment variable shows up as a purge that never ran rather than
 * as one anybody on the internet can trigger.
 *
 * Set RETENTION_PURGE_TOKEN and call it daily:
 *
 *   curl -fsS -X POST https://your-app/api/retention/purge \
 *        -H "authorization: Bearer $RETENTION_PURGE_TOKEN"
 */
export async function POST(request: Request) {
  const secret = process.env.RETENTION_PURGE_TOKEN;
  if (!secret) {
    return NextResponse.json(
      { error: "RETENTION_PURGE_TOKEN is not set, so the retention purge is disabled." },
      { status: 503 },
    );
  }

  const offered = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqual(offered, secret)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const cutoff = retentionCutoff();
  const expired = await listVideosBefore(cutoff.toISOString());

  let deleted = 0;
  const failed: string[] = [];

  for (const video of expired) {
    try {
      // File first: if the row goes and the blob does not, the footage is
      // still on disk with nothing left pointing at it, and the next run
      // will not find it either.
      await deleteVideoFile(video);
      await deleteVideoAsSystem(video.id);
      deleted++;
    } catch {
      failed.push(video.id);
    }
  }

  return NextResponse.json({
    retentionDays: retentionDays(),
    cutoff: cutoff.toISOString(),
    considered: expired.length,
    deleted,
    // Named rather than counted: a video that will not delete is a compliance
    // problem, and whoever reads this needs to know which one.
    failed,
  });
}

/** Constant-time compare, so the secret can't be recovered a byte at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
