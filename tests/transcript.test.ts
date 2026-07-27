import { test } from "node:test";
import assert from "node:assert/strict";

import { joinTranscriptChunks } from "../src/lib/transcript-join.ts";
import { planChunks, TARGET_SAMPLE_RATE, OVERLAP_SECONDS } from "../src/lib/audio-chunking.ts";

test("a single chunk comes back unchanged", () => {
  assert.equal(joinTranscriptChunks(["This is the lounge."]), "This is the lounge.");
});

test("empty and blank chunks are dropped", () => {
  assert.equal(joinTranscriptChunks(["", "  ", "Kitchen next."]), "Kitchen next.");
  assert.equal(joinTranscriptChunks([]), "");
});

test("chunks with no overlap are simply joined", () => {
  assert.equal(
    joinTranscriptChunks(["This is the lounge.", "Now the kitchen."]),
    "This is the lounge. Now the kitchen.",
  );
});

test("words repeated across the chunk boundary are not duplicated", () => {
  const joined = joinTranscriptChunks([
    "we have a three seater sofa and two armchairs in here",
    "and two armchairs in here then through to the kitchen",
  ]);
  assert.equal(joined, "we have a three seater sofa and two armchairs in here then through to the kitchen");
});

test("overlap is matched despite differing punctuation and case", () => {
  const joined = joinTranscriptChunks([
    "the master bedroom has a double bed",
    "Has a double bed, and a wardrobe.",
  ]);
  assert.equal(joined, "the master bedroom has a double bed and a wardrobe.");
});

test("a short coincidental repeat is not treated as an overlap", () => {
  // "the" repeating either side of a seam must not swallow real words.
  const joined = joinTranscriptChunks(["that is the", "the garage is full of boxes"]);
  assert.ok(joined.includes("garage is full of boxes"));
  assert.ok(joined.startsWith("that is the"));
});

test("three chunks stitch in order", () => {
  const joined = joinTranscriptChunks([
    "one two three four five six",
    "four five six seven eight nine",
    "seven eight nine ten eleven twelve",
  ]);
  assert.equal(joined, "one two three four five six seven eight nine ten eleven twelve");
});

// ---- Audio chunk boundaries ----

test("short audio is a single chunk", () => {
  const chunks = planChunks(60 * TARGET_SAMPLE_RATE);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].startFrame, 0);
  assert.equal(chunks[0].endFrame, 60 * TARGET_SAMPLE_RATE);
});

test("no audio produces no chunks", () => {
  assert.deepEqual(planChunks(0), []);
});

test("long audio is split with an overlap at each seam", () => {
  const chunks = planChunks(25 * 60 * TARGET_SAMPLE_RATE);
  assert.ok(chunks.length >= 4, `expected 4+ chunks for 25 minutes, got ${chunks.length}`);

  for (let i = 1; i < chunks.length; i++) {
    const overlapFrames = chunks[i - 1].endFrame - chunks[i].startFrame;
    assert.equal(overlapFrames, OVERLAP_SECONDS * TARGET_SAMPLE_RATE, `seam ${i} lost its overlap`);
  }
});

test("chunks cover the whole recording with no gaps", () => {
  for (const minutes of [1, 8, 8.5, 17, 40, 121]) {
    const total = Math.round(minutes * 60 * TARGET_SAMPLE_RATE);
    const chunks = planChunks(total);

    assert.equal(chunks[0].startFrame, 0, `${minutes}m did not start at zero`);
    assert.equal(chunks.at(-1)!.endFrame, total, `${minutes}m did not reach the end`);

    for (let i = 1; i < chunks.length; i++) {
      assert.ok(
        chunks[i].startFrame < chunks[i - 1].endFrame,
        `${minutes}m has a gap before chunk ${i}`,
      );
    }
  }
});

test("no chunk exceeds what a transcription API will accept", () => {
  // 16-bit mono at 16 kHz, plus a 44-byte WAV header.
  const chunks = planChunks(3 * 60 * 60 * TARGET_SAMPLE_RATE);
  for (const chunk of chunks) {
    const bytes = (chunk.endFrame - chunk.startFrame) * 2 + 44;
    assert.ok(bytes < 25 * 1024 * 1024, `chunk is ${Math.round(bytes / 1024 / 1024)} MB`);
  }
});

test("chunk planning always terminates, even with a silly overlap", () => {
  const chunks = planChunks(10 * TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE, 1, 5);
  assert.ok(chunks.length > 0 && chunks.length < 100);
  assert.equal(chunks.at(-1)!.endFrame, 10 * TARGET_SAMPLE_RATE);
});
