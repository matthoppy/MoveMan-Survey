/**
 * Chunk boundaries for long audio.
 *
 * Pure arithmetic, kept out of the browser audio module so it can be tested
 * directly — getting a boundary wrong loses whole minutes of narration, and
 * that is not something you notice until a quote is already wrong.
 */

/** Speech models are trained at 16 kHz; sending more is wasted bandwidth. */
export const TARGET_SAMPLE_RATE = 16_000;

/**
 * Seconds of audio per chunk. At 16 kHz 16-bit mono a chunk is ~32 kB/s, so
 * eight minutes is about 15 MB — inside the 25 MB limit most transcription
 * APIs impose, with room for the WAV header and a safety margin.
 */
export const CHUNK_SECONDS = 8 * 60;

/**
 * Overlap between consecutive chunks, so a word spoken across a boundary is
 * present in full in at least one of them and the stitcher has something to
 * match on.
 */
export const OVERLAP_SECONDS = 2;

export interface ChunkRange {
  startFrame: number;
  endFrame: number;
  startSec: number;
  endSec: number;
}

export function planChunks(
  totalFrames: number,
  sampleRate: number = TARGET_SAMPLE_RATE,
  chunkSeconds: number = CHUNK_SECONDS,
  overlapSeconds: number = OVERLAP_SECONDS,
): ChunkRange[] {
  if (totalFrames <= 0) return [];

  const chunkFrames = Math.max(1, Math.round(chunkSeconds * sampleRate));
  // Capped at half a chunk: a larger overlap would transcribe most of the
  // audio twice, and at the limit the cursor would barely advance at all.
  const overlapFrames = Math.min(
    Math.max(0, Math.round(overlapSeconds * sampleRate)),
    Math.floor(chunkFrames / 2),
  );

  const ranges: ChunkRange[] = [];
  let start = 0;

  while (start < totalFrames) {
    const end = Math.min(totalFrames, start + chunkFrames);
    ranges.push({
      startFrame: start,
      endFrame: end,
      startSec: start / sampleRate,
      endSec: end / sampleRate,
    });

    if (end >= totalFrames) break;
    start = end - overlapFrames;
  }

  return ranges;
}
