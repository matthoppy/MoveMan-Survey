/**
 * Stitching transcript chunks back together.
 *
 * Lives apart from the transcription client so the browser can import it
 * without pulling in anything that touches server credentials.
 */

/**
 * Joins chunk transcripts back into one narration.
 *
 * Chunks overlap by a couple of seconds so no word is cut in half, which means
 * the tail of one chunk and the head of the next can repeat. This trims the
 * longest repeated run of words at the seam.
 */
export function joinTranscriptChunks(parts: string[]): string {
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return "";

  return clean.reduce((joined, next) => {
    const overlap = longestOverlap(joined, next);
    return overlap > 0 ? `${joined} ${next.split(/\s+/).slice(overlap).join(" ")}`.trim() : `${joined} ${next}`.trim();
  });
}

/** How many words at the end of `a` repeat at the start of `b`. */
function longestOverlap(a: string, b: string): number {
  const tail = a.split(/\s+/).slice(-24).map(normalise);
  const head = b.split(/\s+/).slice(0, 24).map(normalise);

  for (let length = Math.min(tail.length, head.length); length >= 3; length--) {
    const fromTail = tail.slice(tail.length - length).join(" ");
    const fromHead = head.slice(0, length).join(" ");
    if (fromTail && fromTail === fromHead) return length;
  }

  return 0;
}

function normalise(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}
