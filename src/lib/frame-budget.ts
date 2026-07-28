/**
 * Splits a fixed number of keyframes across the parts of a recording.
 *
 * A survey can arrive in more than one piece — the customer's phone rang, the
 * tab was closed and reopened, or they filmed upstairs and downstairs
 * separately. Every part has to be looked at, but the total frame count is
 * capped because frames are what the analysis costs, so the budget is shared
 * out by how long each part runs.
 *
 * Two rules matter more than exactness. Every part gets at least one frame,
 * because a thirty-second clip of the garage is still the only record of the
 * garage. And the total never exceeds the budget, because that is the number
 * the cost was worked out from.
 */
export interface FramePart {
  durationSec: number | null;
}

export function allocateFrames(parts: FramePart[], budget: number): number[] {
  if (parts.length === 0 || budget <= 0) return parts.map(() => 0);

  // More parts than frames: one each for as many as the budget covers. Better
  // to see a little of several rooms than all of one.
  if (parts.length >= budget) {
    return parts.map((_, index) => (index < budget ? 1 : 0));
  }

  // A part with no readable duration still has to be looked at. Treating it as
  // an average-length part keeps it in the running without letting a missing
  // number swallow the whole budget.
  const known = parts.map((p) => (p.durationSec && p.durationSec > 0 ? p.durationSec : null));
  const average = known.filter((d): d is number => d !== null).reduce((a, b) => a + b, 0) /
    Math.max(1, known.filter((d) => d !== null).length);
  const durations = known.map((d) => d ?? (average > 0 ? average : 1));
  const total = durations.reduce((a, b) => a + b, 0);

  // One each up front, then the rest shared by length.
  const allocation = parts.map(() => 1);
  let remaining = budget - parts.length;

  const shares = durations.map((d) => (remaining * d) / total);
  const whole = shares.map(Math.floor);

  for (let i = 0; i < parts.length; i++) {
    allocation[i] += whole[i];
    remaining -= whole[i];
  }

  // Flooring leaves a few frames over. They go to the parts with the largest
  // fractions — the longest parts, which is where an extra frame buys most.
  const byRemainder = shares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; i < remaining; i++) {
    allocation[byRemainder[i % byRemainder.length].index]++;
  }

  return allocation;
}

export function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}
