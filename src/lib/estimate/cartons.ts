import type { InventoryItem, PackingLevel, RoomSurvey } from "../types";

export type CartonType = "large" | "medium" | "book" | "wardrobe";

export interface CartonSpec {
  /** What the warehouse calls it. */
  name: string;
  /** Outside dimensions in millimetres, length × width × depth. */
  mm: [number, number, number];
  /** The code it is ordered under. */
  code: string;
  /**
   * False where the dimensions are the standard trade size rather than the
   * ones this company actually buys. Swap them in and every volume, van and
   * price downstream follows — that is the point of deriving rather than
   * hard-coding.
   */
  confirmed: boolean;
}

/**
 * The cartons themselves.
 *
 * Volume is worked out from the dimensions rather than written down beside
 * them, because a carton's volume is not an opinion and the two drift apart
 * the moment someone edits one and not the other. It happened here: the large
 * carton was carrying 3 cu ft against real dimensions of 4.5, so every packed
 * kitchen was under-read by about a third of a cubic metre and the van was
 * sized from the wrong number.
 */
export const CARTON_SPECS: Record<CartonType, CartonSpec> = {
  large: { name: "Large carton", code: "610 x 457 x 457", mm: [610, 457, 457], confirmed: true },
  medium: { name: "Medium (no.2) carton", code: "457 x 457 x 406", mm: [457, 457, 406], confirmed: false },
  book: { name: "Book (small) carton", code: "457 x 305 x 305", mm: [457, 305, 305], confirmed: false },
  wardrobe: { name: "Hanging wardrobe carton", code: "508 x 457 x 1219", mm: [508, 457, 1219], confirmed: false },
};

const CUFT_PER_CUBIC_MM = 35.3147 / 1_000_000_000;

export function cartonVolumeCuFt(type: CartonType): number {
  const [l, w, d] = CARTON_SPECS[type].mm;
  // Rounded to two places: the estimate is quoted in whole cubic feet, and
  // carrying the full float only makes the working harder to check by hand.
  return Math.round(l * w * d * CUFT_PER_CUBIC_MM * 100) / 100;
}

/** Volume a packed carton occupies on the van, cubic feet. */
export const CARTON_VOLUME_CUFT: Record<CartonType, number> = {
  large: cartonVolumeCuFt("large"),
  medium: cartonVolumeCuFt("medium"),
  book: cartonVolumeCuFt("book"),
  wardrobe: cartonVolumeCuFt("wardrobe"),
};

export interface CartonPlan {
  large: number;
  medium: number;
  book: number;
  wardrobe: number;
  /** Same counts split per room, for the room-by-room breakdown. */
  byRoom: Map<string, CartonPlan>;
}

const emptyPlan = (): CartonPlan => ({ large: 0, medium: 0, book: 0, wardrobe: 0, byRoom: new Map() });

type RoomProfile = Omit<CartonPlan, "byRoom">;

/**
 * Cartons needed to fully pack a room of each type.
 *
 * Trade rules of thumb: a kitchen is carton-heavy and fragile, a study is
 * book-carton heavy because paper is dense, a bathroom barely registers.
 */
const ROOM_PROFILES: Record<string, RoomProfile> = {
  kitchen: { large: 6, medium: 14, book: 4, wardrobe: 0 },
  dining: { large: 3, medium: 8, book: 2, wardrobe: 0 },
  lounge: { large: 4, medium: 7, book: 5, wardrobe: 0 },
  bedroom: { large: 5, medium: 7, book: 1, wardrobe: 0 },
  study: { large: 2, medium: 5, book: 9, wardrobe: 0 },
  bathroom: { large: 1, medium: 3, book: 0, wardrobe: 0 },
  utility: { large: 2, medium: 4, book: 0, wardrobe: 0 },
  hallway: { large: 1, medium: 3, book: 1, wardrobe: 0 },
  garage: { large: 6, medium: 6, book: 0, wardrobe: 0 },
  garden: { large: 3, medium: 3, book: 0, wardrobe: 0 },
  loft: { large: 7, medium: 5, book: 2, wardrobe: 0 },
  conservatory: { large: 2, medium: 3, book: 0, wardrobe: 0 },
  nursery: { large: 4, medium: 6, book: 2, wardrobe: 0 },
};

const DEFAULT_PROFILE: RoomProfile = { large: 3, medium: 5, book: 2, wardrobe: 0 };

/** A part pack is roughly this share of a full pack. */
const PART_PACK_FACTOR = 0.4;

export function roomProfileFor(roomName: string): RoomProfile {
  const key = roomName.toLowerCase();
  for (const [type, profile] of Object.entries(ROOM_PROFILES)) {
    if (key.includes(type)) return profile;
  }
  // Common synonyms that don't share a substring with the profile key.
  if (/living|sitting|front room|snug|family room/.test(key)) return ROOM_PROFILES.lounge;
  if (/bed\s?\d|master|guest|box room/.test(key)) return ROOM_PROFILES.bedroom;
  if (/office|den/.test(key)) return ROOM_PROFILES.study;
  if (/shed|outbuilding/.test(key)) return ROOM_PROFILES.garden;
  if (/en.?suite|shower|wc|cloakroom/.test(key)) return ROOM_PROFILES.bathroom;
  if (/attic/.test(key)) return ROOM_PROFILES.loft;
  return DEFAULT_PROFILE;
}

/** Wardrobe cartons needed for the hanging space in a given wardrobe. */
function wardrobeCartonsFor(catalogId: string | null): number {
  switch (catalogId) {
    case "wardrobe-1":
      return 2;
    case "wardrobe-2":
      return 3;
    case "wardrobe-3":
      return 5;
    default:
      return 0;
  }
}

/**
 * Work out the cartons the crew has to supply.
 *
 * Two sources feed in:
 *  - the packing level set against each room (the crew packing service), and
 *  - individual items that always need a carton of their own, whoever packs —
 *    televisions, mirrors, artwork, computers.
 *
 * Cartons the customer has already packed arrive as inventory items in their
 * own right (`carton-med` and friends) and are deliberately not counted here;
 * they contribute volume, not materials.
 */
export function cartonPlan(items: InventoryItem[], rooms: RoomSurvey[]): CartonPlan {
  const plan = emptyPlan();

  const levelByRoom = new Map<string, PackingLevel>();
  for (const room of rooms) levelByRoom.set(room.name, room.packingLevel);

  const add = (room: string, type: CartonType, n: number) => {
    if (n <= 0) return;
    plan[type] += n;
    const existing = plan.byRoom.get(room) ?? emptyPlan();
    existing[type] += n;
    plan.byRoom.set(room, existing);
  };

  // Room-level packing service.
  for (const room of rooms) {
    if (room.packingLevel === "none") continue;
    const profile = roomProfileFor(room.name);
    const factor = room.packingLevel === "full" ? 1 : PART_PACK_FACTOR;
    add(room.name, "large", Math.ceil(profile.large * factor));
    add(room.name, "medium", Math.ceil(profile.medium * factor));
    add(room.name, "book", Math.ceil(profile.book * factor));
  }

  // Item-level cartons.
  for (const item of items) {
    const room = item.room || "Unspecified";
    const level = levelByRoom.get(item.room) ?? "none";

    // Hanging garments: only our problem if we're doing the packing.
    if (item.packing === "wardrobe" && level !== "none") {
      const per = wardrobeCartonsFor(item.catalogId);
      const scaled = level === "full" ? per : Math.ceil(per * PART_PACK_FACTOR);
      add(room, "wardrobe", scaled * item.quantity);
    }

  }

  return plan;
}

export function totalCartons(plan: CartonPlan): number {
  return plan.large + plan.medium + plan.book + plan.wardrobe;
}
