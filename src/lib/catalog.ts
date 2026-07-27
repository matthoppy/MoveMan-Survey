import type { PackingClass } from "./types";

/**
 * Volume table for household goods, in cubic feet per unit.
 *
 * These are the standard trade figures a surveyor would carry in their head —
 * a 3-seater is 45 cu ft, a double bed 45, a double wardrobe 60. They are
 * deliberately generous: under-estimating volume is what leaves goods on the
 * pavement at the end of the day.
 */
export interface CatalogEntry {
  id: string;
  name: string;
  /** Rooms this item is normally found in — used to disambiguate AI matches. */
  rooms: string[];
  cuFt: number;
  fragile: boolean;
  twoPersonLift: boolean;
  dismantle: boolean;
  packing: PackingClass;
  /** Alternative phrasings a client might use on the video. */
  aliases: string[];
}

const e = (
  id: string,
  name: string,
  cuFt: number,
  rooms: string[],
  opts: Partial<Omit<CatalogEntry, "id" | "name" | "cuFt" | "rooms">> = {},
): CatalogEntry => ({
  id,
  name,
  cuFt,
  rooms,
  fragile: opts.fragile ?? false,
  twoPersonLift: opts.twoPersonLift ?? cuFt >= 30,
  dismantle: opts.dismantle ?? false,
  packing: opts.packing ?? "wrap",
  aliases: opts.aliases ?? [],
});

export const CATALOG: CatalogEntry[] = [
  // ---- Living room ----
  e("sofa-2", "2-seater sofa", 35, ["lounge"], { aliases: ["two seater sofa", "two seater", "2 seater", "loveseat"] }),
  e("sofa-3", "3-seater sofa", 45, ["lounge"], { aliases: ["three seater sofa", "three seater", "3 seater", "sofa", "couch", "settee"] }),
  e("sofa-corner", "Corner / L-shape sofa", 70, ["lounge"], { dismantle: true, aliases: ["corner sofa", "corner suite", "sectional", "l shaped sofa", "l shape sofa"] }),
  e("sofa-bed", "Sofa bed", 55, ["lounge"], { aliases: ["futon"] }),
  e("armchair", "Armchair", 20, ["lounge"], { twoPersonLift: false, aliases: ["easy chair", "occasional chair"] }),
  e("recliner", "Recliner armchair", 28, ["lounge"], { aliases: ["reclining chair"] }),
  e("footstool", "Footstool / pouffe", 6, ["lounge"], { twoPersonLift: false, aliases: ["ottoman stool"] }),
  e("coffee-table", "Coffee table", 10, ["lounge"], { twoPersonLift: false }),
  e("nest-tables", "Nest of tables", 5, ["lounge"], { twoPersonLift: false }),
  e("tv-small", 'TV up to 43"', 6, ["lounge"], { fragile: true, twoPersonLift: false, packing: "carton" }),
  e("tv-large", 'TV 44-65"', 12, ["lounge"], { fragile: true, twoPersonLift: true, packing: "carton" }),
  e("tv-xl", 'TV over 65"', 18, ["lounge"], { fragile: true, twoPersonLift: true, packing: "carton" }),
  e("tv-unit", "TV / media unit", 18, ["lounge"], {}),
  e("bookcase-sm", "Bookcase (small)", 15, ["lounge", "study"], { packing: "carton", twoPersonLift: false }),
  e("bookcase-lg", "Bookcase (large)", 28, ["lounge", "study"], { packing: "carton", dismantle: true }),
  e("display-cabinet", "Display cabinet", 32, ["lounge", "dining"], { fragile: true, packing: "carton" }),
  e("sideboard", "Sideboard", 30, ["lounge", "dining"], { packing: "carton" }),
  e("rug", "Rug (rolled)", 6, ["lounge"], { twoPersonLift: false }),
  e("floor-lamp", "Floor lamp", 5, ["lounge"], { fragile: true, twoPersonLift: false }),
  e("piano-upright", "Upright piano", 60, ["lounge"], { twoPersonLift: true, packing: "specialist", aliases: ["piano"] }),
  e("piano-grand", "Grand piano", 120, ["lounge"], { twoPersonLift: true, packing: "specialist" }),
  e("aquarium", "Aquarium / fish tank", 20, ["lounge"], { fragile: true, packing: "specialist" }),
  e("mirror-lg", "Large mirror", 5, ["lounge", "hallway", "bedroom"], { fragile: true, twoPersonLift: false, packing: "carton" }),
  e("picture-lg", "Large picture / artwork", 4, ["lounge", "hallway"], { fragile: true, twoPersonLift: false, packing: "carton" }),

  // ---- Dining ----
  e("dining-table-4", "Dining table (4-seat)", 20, ["dining"], { dismantle: true }),
  e("dining-table-6", "Dining table (6-seat)", 32, ["dining"], { dismantle: true, aliases: ["dining table"] }),
  e("dining-table-8", "Dining table (8-seat)", 42, ["dining"], { dismantle: true }),
  e("dining-chair", "Dining chair", 5, ["dining"], { twoPersonLift: false, aliases: ["chair"] }),
  e("dresser", "Dresser / welsh dresser", 38, ["dining"], { fragile: true, packing: "carton", dismantle: true }),

  // ---- Bedrooms ----
  e("bed-single", "Single bed + mattress", 30, ["bedroom"], { dismantle: true }),
  e("bed-double", "Double bed + mattress", 45, ["bedroom"], { dismantle: true, aliases: ["bed"] }),
  e("bed-king", "King bed + mattress", 55, ["bedroom"], { dismantle: true }),
  e("bed-superking", "Super king bed + mattress", 68, ["bedroom"], { dismantle: true }),
  e("bunk-bed", "Bunk bed", 48, ["bedroom"], { dismantle: true }),
  e("divan-drawers", "Divan base with drawers", 35, ["bedroom"], { packing: "carton" }),
  e("cot", "Cot / cot bed", 15, ["bedroom"], { dismantle: true, twoPersonLift: false }),
  e("wardrobe-1", "Single wardrobe", 35, ["bedroom"], { packing: "wardrobe", dismantle: true }),
  e("wardrobe-2", "Double wardrobe", 60, ["bedroom"], { packing: "wardrobe", dismantle: true, aliases: ["wardrobe"] }),
  e("wardrobe-3", "Triple wardrobe", 90, ["bedroom"], { packing: "wardrobe", dismantle: true }),
  e("chest-3", "Chest of drawers (3-drawer)", 20, ["bedroom"], { packing: "carton", twoPersonLift: false }),
  e("chest-5", "Chest of drawers (5-drawer)", 30, ["bedroom"], { packing: "carton" }),
  e("bedside", "Bedside table", 8, ["bedroom"], { twoPersonLift: false }),
  e("dressing-table", "Dressing table", 25, ["bedroom"], { fragile: true, packing: "carton" }),
  e("blanket-box", "Blanket box / ottoman", 16, ["bedroom"], { packing: "carton", twoPersonLift: false }),

  // ---- Kitchen & utility ----
  e("fridge-freezer", "Fridge freezer", 32, ["kitchen"], { packing: "carton", aliases: ["fridge", "tall fridge freezer"] }),
  e("fridge-under", "Under-counter fridge", 12, ["kitchen"], { twoPersonLift: false, packing: "carton" }),
  e("chest-freezer", "Chest freezer", 26, ["kitchen", "garage"], { packing: "carton" }),
  e("washing-machine", "Washing machine", 16, ["kitchen", "utility"], { twoPersonLift: true, aliases: ["washer"] }),
  e("tumble-dryer", "Tumble dryer", 16, ["kitchen", "utility"], { twoPersonLift: true }),
  e("dishwasher", "Dishwasher", 15, ["kitchen"], { twoPersonLift: true }),
  e("cooker", "Cooker / oven", 22, ["kitchen"], { twoPersonLift: true, aliases: ["oven", "range cooker"] }),
  e("microwave", "Microwave", 4, ["kitchen"], { twoPersonLift: false, packing: "carton" }),
  e("kitchen-table", "Kitchen table", 20, ["kitchen"], { dismantle: true }),
  e("kitchen-chair", "Kitchen chair", 5, ["kitchen"], { twoPersonLift: false, aliases: ["chair"] }),
  e("kitchen-cupboards", "Kitchen cupboard contents", 0, ["kitchen"], { fragile: true, packing: "carton", twoPersonLift: false, aliases: ["crockery", "china", "pots and pans", "cupboards"] }),

  // ---- Study / office ----
  e("desk", "Desk", 25, ["study"], { dismantle: true, packing: "carton" }),
  e("office-chair", "Office chair", 12, ["study"], { twoPersonLift: false }),
  e("filing-2", "Filing cabinet (2-drawer)", 12, ["study"], { packing: "carton", twoPersonLift: false }),
  e("filing-4", "Filing cabinet (4-drawer)", 22, ["study"], { packing: "carton" }),
  e("computer", "Desktop computer / monitor", 5, ["study"], { fragile: true, twoPersonLift: false, packing: "carton" }),
  e("printer", "Printer", 5, ["study"], { fragile: true, twoPersonLift: false, packing: "carton" }),
  e("safe", "Safe", 15, ["study"], { twoPersonLift: true, packing: "specialist" }),

  // ---- Garage, garden, loft ----
  e("lawnmower", "Lawn mower", 12, ["garage", "garden"], { twoPersonLift: false }),
  e("garden-table", "Garden table", 22, ["garden"], { dismantle: true }),
  e("garden-chair", "Garden chair (stacking)", 4, ["garden"], { twoPersonLift: false }),
  e("patio-set", "Patio set", 42, ["garden"], { dismantle: true }),
  e("bbq", "BBQ", 16, ["garden"], {}),
  e("bicycle", "Bicycle", 12, ["garage"], { twoPersonLift: false }),
  e("tool-chest", "Tool chest", 15, ["garage"], { packing: "carton" }),
  e("ladder", "Ladder", 8, ["garage"], { twoPersonLift: false }),
  e("shed-contents", "Shed contents", 60, ["garden"], { packing: "carton" }),
  e("loft-contents", "Loft contents", 50, ["loft"], { packing: "carton" }),
  e("workbench", "Workbench", 25, ["garage"], { dismantle: true }),
  e("treadmill", "Treadmill", 35, ["garage", "study"], { twoPersonLift: true, dismantle: true }),
  e("exercise-bike", "Exercise bike", 20, ["garage", "study"], {}),
  e("pool-table", "Pool table", 70, ["garage"], { twoPersonLift: true, dismantle: true, packing: "specialist" }),

  // ---- Cartons the customer has already packed ----
  e("carton-med", "Medium carton (packed)", 1.5, ["any"], { twoPersonLift: false, packing: "none", aliases: ["box", "boxes"] }),
  e("carton-lg", "Large carton (packed)", 3, ["any"], { twoPersonLift: false, packing: "none" }),
  e("carton-book", "Book carton (packed)", 1, ["any"], { twoPersonLift: false, packing: "none" }),
  e("plastic-box", "Plastic storage box", 3, ["any"], { twoPersonLift: false, packing: "none" }),
  e("suitcase", "Suitcase", 4, ["any"], { twoPersonLift: false, packing: "none" }),
];

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9" ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort match of a free-text item description onto the catalogue.
 *
 * Used both to resolve what the AI returned and to power the manual
 * add-item box, so a surveyor typing "3 seater" lands on the same volume
 * figure the analyser would have used.
 */
export function matchCatalog(description: string, room?: string): CatalogEntry | undefined {
  const q = normalise(description);
  if (!q) return undefined;

  const roomKey = room ? normalise(room) : "";
  const roomHint = ["bedroom", "kitchen", "lounge", "dining", "study", "garage", "garden", "loft", "utility", "hallway"].find(
    (r) => roomKey.includes(r),
  );

  let best: { entry: CatalogEntry; score: number } | undefined;

  for (const entry of CATALOG) {
    const names = [entry.name, ...entry.aliases].map(normalise);
    let score = 0;

    for (const name of names) {
      if (q === name) score = Math.max(score, 100);
      else if (q.includes(name)) score = Math.max(score, 80 - (q.length - name.length) * 0.5);
      else if (name.includes(q) && q.length >= 4) score = Math.max(score, 70 - (name.length - q.length) * 0.5);
      else {
        // Token overlap, so "large bookcase oak" still finds "Bookcase (large)".
        const nameTokens = name.split(" ").filter((t) => t.length > 2);
        const qTokens = new Set(q.split(" "));
        const hits = nameTokens.filter((t) => qTokens.has(t)).length;
        if (hits > 0 && nameTokens.length > 0) {
          score = Math.max(score, (hits / nameTokens.length) * 55);
        }
      }
    }

    if (score <= 0) continue;

    // A qualifier the candidate can't account for means this is the wrong line,
    // however well the rest of the words match.
    const unmatchedQualifier = QUALIFIERS.some(
      (word) => hasWord(q, word) && !names.some((name) => hasWord(name, word)),
    );
    if (unmatchedQualifier) score *= 0.35;

    if (roomHint && entry.rooms.includes(roomHint)) score += 8;
    if (!best || score > best.score) best = { entry, score };
  }

  return best && best.score >= 40 ? best.entry : undefined;
}

/**
 * Words that change *which* item you are looking at, not just how it is
 * described. "single bed" and "double bed" are different lines with 15 cu ft
 * between them, so a match that ignores the qualifier is wrong even when every
 * other word lines up — and without this, the generic "bed" alias on the double
 * outscores the single's own name.
 */
const QUALIFIERS = [
  "single",
  "double",
  "king",
  "super",
  "triple",
  "bunk",
  "corner",
  "two",
  "three",
  "small",
  "large",
];

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(?:^|[^a-z])${word}(?:[^a-z]|$)`).test(text);
}
