import { DEFAULT_ACCESS, type AccessDetails } from "./types";

/**
 * Fold the analyser's access observations into what the office already entered.
 *
 * Only fields still sitting at their default are taken from the video. What a
 * human typed always wins: the office may have spoken to the customer, checked
 * the street on a map, or surveyed the property before, and none of that is
 * visible in a phone recording. Letting a guess overwrite it is how a
 * second-floor flat gets priced as a ground-floor house — the model reads a
 * hallway, says "ground floor", and the crew arrives short-handed.
 *
 * The model's observations still reach the surveyor either way: they are
 * recorded as flags on the survey.
 */
export function mergeAccessSuggestion(
  current: AccessDetails,
  suggestion: Partial<AccessDetails>,
): AccessDetails {
  const merged: AccessDetails = { ...current };

  for (const [key, value] of Object.entries(suggestion) as Array<
    [keyof AccessDetails, AccessDetails[keyof AccessDetails]]
  >) {
    if (value === undefined) continue;
    // Untouched by the office — the video is better than nothing.
    if (current[key] === DEFAULT_ACCESS[key]) {
      Object.assign(merged, { [key]: value });
    }
  }

  return merged;
}
