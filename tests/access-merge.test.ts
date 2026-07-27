import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeAccessSuggestion } from "../src/lib/access-merge.ts";
import { DEFAULT_ACCESS, type AccessDetails } from "../src/lib/types.ts";

test("the video fills in fields the office never touched", () => {
  const merged = mergeAccessSuggestion(DEFAULT_ACCESS, {
    parkingRestricted: true,
    awkwardStairs: true,
  });
  assert.equal(merged.parkingRestricted, true);
  assert.equal(merged.awkwardStairs, true);
});

test("what the office entered is never overwritten by the model", () => {
  // The office was told it's a second-floor flat. The model sees a hallway and
  // guesses ground floor. Pricing a 2nd-floor flat as ground floor sends the
  // crew out short-handed, so the human's figure must survive.
  const entered: AccessDetails = { ...DEFAULT_ACCESS, floor: 2, carryDistanceM: 40 };
  const merged = mergeAccessSuggestion(entered, { floor: 0, carryDistanceM: 5 });

  assert.equal(merged.floor, 2);
  assert.equal(merged.carryDistanceM, 40);
});

test("a human's deliberate false is not treated as unset", () => {
  const entered: AccessDetails = { ...DEFAULT_ACCESS, liftAvailable: true };
  const merged = mergeAccessSuggestion(entered, { liftAvailable: false });
  assert.equal(merged.liftAvailable, true, "the office said there is a lift");
});

test("an empty suggestion changes nothing", () => {
  const entered: AccessDetails = { ...DEFAULT_ACCESS, floor: 3 };
  assert.deepEqual(mergeAccessSuggestion(entered, {}), entered);
});

test("undefined fields in the suggestion are ignored", () => {
  const merged = mergeAccessSuggestion(DEFAULT_ACCESS, { floor: undefined, hoistRequired: true });
  assert.equal(merged.floor, DEFAULT_ACCESS.floor);
  assert.equal(merged.hoistRequired, true);
});
