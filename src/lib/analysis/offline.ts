import { CATALOG } from "../catalog";
import type { RawAnalysis, RawAnalysisItem } from "./schema";

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, pair: 2, few: 3, several: 4,
};

const ROOM_WORDS = [
  "hallway", "hall", "lounge", "living room", "sitting room", "front room",
  "dining room", "kitchen", "utility", "bathroom", "en suite", "ensuite",
  "master bedroom", "bedroom", "nursery", "study", "office", "conservatory",
  "garage", "garden", "shed", "loft", "attic", "basement", "cellar",
];

/** Catalogue entries that are containers rather than goods. */
const CONTAINER_IDS = new Set(["carton-med", "carton-lg", "carton-book", "plastic-box", "suitcase"]);

const NOT_GOING = /\b(not (coming|going|taking)|leaving (it|that|this|these|them)|staying|being sold|we'?re selling|goes to the tip|disposing|scrapping|left behind)\b/;
const FULL_PACK = /\b(pack (it|this|that|everything|the whole)|you'?ll be packing|can you pack|could you pack|want you to pack|full pack)\b/;
const SELF_PACK =
  /\b((we|i)\s?(?:'ll| will| shall|'re going to| am going to| are going to)?\s?(?:do|pack)\b[^.!?]*\bown\b|(?:our|my) own (?:boxes|packing|cartons|boxing)|doing (?:our|my) own|already (?:packed|boxed)|we'?ve packed|we have packed)/;
const PART_PACK = /\b(just the (fragile|breakable|china|glass)|only the (fragile|breakable)|part pack)\b/;

/**
 * Keyword-driven analysis used when no ANTHROPIC_API_KEY is configured.
 *
 * It reads the narration transcript only — it cannot see the video — so it
 * produces a deliberately conservative inventory and flags itself loudly.
 * The point is that the rest of the workflow (materials, crew, quoting)
 * stays exercisable without an API key.
 */
export function offlineAnalyse(transcript: string): RawAnalysis {
  const text = transcript.toLowerCase();
  const flags: string[] = [
    "Estimated without AI video analysis (no ANTHROPIC_API_KEY set) — this inventory comes from the narration transcript alone and has not been checked against the video. Verify every line before quoting.",
  ];

  if (!text.trim()) {
    return {
      summary: "No transcript available and AI analysis is not configured, so no inventory could be produced.",
      rooms: [],
      items: [],
      flags: [...flags, "No narration transcript was captured — nothing to work from."],
    };
  }

  // Split into sentences and track which room we are in as we go.
  const sentences = transcript.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
  const items: RawAnalysisItem[] = [];
  const roomsSeen = new Map<string, { packingLevel: "none" | "part" | "full"; notes: string[] }>();

  let currentRoom = "Unspecified";

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    const room = ROOM_WORDS.find((r) => lower.includes(r));
    if (room) {
      currentRoom = titleCase(room);
      if (!roomsSeen.has(currentRoom)) roomsSeen.set(currentRoom, { packingLevel: "none", notes: [] });
    }
    if (!roomsSeen.has(currentRoom)) roomsSeen.set(currentRoom, { packingLevel: "none", notes: [] });

    const roomState = roomsSeen.get(currentRoom)!;
    let packingSentence = true;
    if (PART_PACK.test(lower)) roomState.packingLevel = "part";
    else if (FULL_PACK.test(lower)) roomState.packingLevel = "full";
    else if (SELF_PACK.test(lower)) roomState.packingLevel = "none";
    else packingSentence = false;


    if (NOT_GOING.test(lower)) {
      roomState.notes.push(`Something in this room is not going: "${sentence.trim()}"`);
      continue;
    }

    for (const entry of CATALOG) {
      // "We'll do our own boxes" states who packs — it is not an order for one
      // carton. Only empty-container entries are suppressed, so a real item
      // named in the same breath ("you pack the china") still counts.
      if (packingSentence && CONTAINER_IDS.has(entry.id)) continue;

      const match = findMention(lower, entry);
      if (!match) continue;
      items.push({
        room: currentRoom,
        name: entry.name,
        quantity: quantityBefore(lower, match.index),
        estimatedCuFt: entry.cuFt,
        fragile: entry.fragile,
        dismantle: entry.dismantle,
        confidence: 0.35,
        notes: `Matched from transcript: "${sentence.trim().slice(0, 140)}"`,
      });
    }
  }

  const merged = mergeDuplicates(items);

  for (const [name, state] of roomsSeen) {
    if (state.packingLevel === "none") {
      flags.push(`Packing not confirmed for ${name} — assumed the customer packs it themselves.`);
    }
  }
  flags.push("Access details were not observed — set floor, lift, parking and carry distance by hand.");

  return {
    summary: `Transcript-only estimate covering ${roomsSeen.size} room(s) and ${merged.length} item line(s). No video frames were analysed.`,
    rooms: [...roomsSeen.entries()].map(([name, state]) => ({
      name,
      packingLevel: state.packingLevel,
      notes: state.notes.join(" ") || undefined,
    })),
    items: merged,
    flags,
  };
}

/**
 * Find a catalogue entry mentioned in a sentence.
 *
 * Matching is on whole words with an optional plural, so "bedroom" no longer
 * counts as a mention of a bed and "armchairs" still counts as armchairs.
 */
function findMention(sentence: string, entry: (typeof CATALOG)[number]): { index: number } | null {
  const phrases = [entry.name.toLowerCase(), ...entry.aliases.map((a) => a.toLowerCase())];

  for (const phrase of phrases) {
    const pattern = new RegExp(`(?<![a-z])${escapeRegExp(phrase)}s?(?![a-z])`);
    const found = pattern.exec(sentence);
    if (found) return { index: found.index };
  }

  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Look just before the matched phrase for "three", "2", "a couple of". */
function quantityBefore(text: string, index: number): number {
  const window = text.slice(Math.max(0, index - 24), index);
  const digits = window.match(/(\d+)\s*(?:x\s*)?[^\d]*$/);
  if (digits) {
    const n = parseInt(digits[1], 10);
    if (n > 0 && n < 100) return n;
  }
  const words = window.trim().split(/\s+/).reverse();
  for (const word of words.slice(0, 3)) {
    const clean = word.replace(/[^a-z]/g, "");
    if (clean in NUMBER_WORDS) return NUMBER_WORDS[clean];
  }
  return 1;
}

function mergeDuplicates(items: RawAnalysisItem[]): RawAnalysisItem[] {
  const byKey = new Map<string, RawAnalysisItem>();
  for (const item of items) {
    const key = `${item.room}::${item.name}`;
    const existing = byKey.get(key);
    if (existing) {
      // Same item mentioned twice is usually the same thing described again,
      // so take the larger stated count rather than adding them up.
      existing.quantity = Math.max(existing.quantity, item.quantity);
    } else {
      byKey.set(key, { ...item });
    }
  }
  return [...byKey.values()];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
