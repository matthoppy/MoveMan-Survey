import { test } from "node:test";
import assert from "node:assert/strict";

import { allocateFrames, sum } from "../src/lib/frame-budget.ts";

const part = (durationSec: number | null) => ({ durationSec });

test("a single recording gets the whole budget", () => {
  assert.deepEqual(allocateFrames([part(600)], 20), [20]);
});

test("the budget is never exceeded", () => {
  // Frames are what the analysis costs, so this is the number the price was
  // worked out from.
  for (const parts of [
    [part(60)],
    [part(60), part(600)],
    [part(1), part(1), part(1), part(1), part(1)],
    [part(300), part(7), part(120), part(45)],
  ]) {
    assert.equal(sum(allocateFrames(parts, 20)) <= 20, true, JSON.stringify(parts));
  }
});

test("the budget is used up rather than left on the table", () => {
  assert.equal(sum(allocateFrames([part(300), part(100), part(50)], 20)), 20);
  assert.equal(sum(allocateFrames([part(7), part(953)], 20)), 20);
});

test("longer parts get proportionally more frames", () => {
  const [long, short] = allocateFrames([part(900), part(100)], 20);
  assert.equal(long > short, true, `${long} vs ${short}`);
  assert.equal(long + short, 20);
});

test("a short part is still looked at", () => {
  // Thirty seconds of the garage is the only record of the garage. Rounding it
  // to zero frames means the analyser never sees that room at all.
  const [main, garage] = allocateFrames([part(1800), part(30)], 20);
  assert.equal(garage >= 1, true, `garage got ${garage}`);
  assert.equal(main + garage, 20);
});

test("a part with no readable duration is not starved", () => {
  // MediaRecorder WebM often has no duration in its header. That must not mean
  // the part is skipped.
  const allocation = allocateFrames([part(600), part(null)], 20);
  assert.equal(allocation[1] >= 1, true, JSON.stringify(allocation));
  assert.equal(sum(allocation), 20);
});

test("durations missing entirely are shared evenly", () => {
  assert.deepEqual(allocateFrames([part(null), part(null)], 20), [10, 10]);
});

test("more parts than frames gives one each until the budget runs out", () => {
  assert.deepEqual(allocateFrames([part(10), part(10), part(10)], 2), [1, 1, 0]);
});

test("no parts and no budget are handled without arithmetic on nothing", () => {
  assert.deepEqual(allocateFrames([], 20), []);
  assert.deepEqual(allocateFrames([part(60)], 0), [0]);
});
