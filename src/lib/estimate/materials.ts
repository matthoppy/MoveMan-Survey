import type { InventoryItem, MaterialLine, RoomSurvey } from "../types";
import { cartonPlan, totalCartons, type CartonPlan } from "./cartons";
import { furnitureVolume } from "./volume";

interface Ctx {
  items: InventoryItem[];
  rooms: RoomSurvey[];
  plan: CartonPlan;
}

function countOf(items: InventoryItem[], ids: string[]): number {
  return items
    .filter((i) => i.catalogId !== null && ids.includes(i.catalogId))
    .reduce((n, i) => n + i.quantity, 0);
}

/**
 * Turn the inventory and the packing brief into a materials order.
 *
 * Every line records the basis it was derived from so a surveyor can argue
 * with the number rather than having to take it on trust.
 */
export function computeMaterials(items: InventoryItem[], rooms: RoomSurvey[]): MaterialLine[] {
  const plan = cartonPlan(items, rooms);
  const ctx: Ctx = { items, rooms, plan };
  const lines: MaterialLine[] = [];

  const push = (sku: string, name: string, unit: string, quantity: number, basis: string) => {
    if (quantity > 0) lines.push({ sku, name, unit, quantity, basis });
  };

  // ---- Cartons ----
  const packedRooms = rooms.filter((r) => r.packingLevel !== "none");
  const packBasis = packedRooms.length
    ? `${packedRooms.length} room(s) to pack: ${packedRooms.map((r) => `${r.name} (${r.packingLevel})`).join(", ")}`
    : "no crew packing requested";

  push("CTN-LG", "Large carton (1.5 cu ft usable)", "each", plan.large, packBasis);
  push("CTN-MD", "Medium carton (standard)", "each", plan.medium, packBasis);
  push("CTN-BK", "Book carton (small, heavy goods)", "each", plan.book, packBasis);
  push("CTN-WD", "Wardrobe carton with rail", "each", plan.wardrobe, "hanging space in wardrobes to be packed");

  // ---- Purpose-made boxes, needed whoever packs the room ----
  const bigTvs = countOf(items, ["tv-large", "tv-xl"]);
  const smallTvs = countOf(items, ["tv-small"]);
  push("BOX-TV", "Flat-screen TV box", "each", bigTvs + smallTvs, `${bigTvs + smallTvs} television(s) in inventory`);

  const artwork = countOf(items, ["mirror-lg", "picture-lg"]);
  push("BOX-PIC", "Picture / mirror box (adjustable)", "each", Math.ceil(artwork / 2), `${artwork} large mirror(s) / picture(s), 2 per box`);

  const computers = countOf(items, ["computer", "printer"]);
  push("BOX-IT", "Computer / electronics carton", "each", computers, `${computers} computer(s) and printer(s)`);

  const lamps = countOf(items, ["floor-lamp"]);
  push("BOX-LAMP", "Lamp carton", "each", lamps, `${lamps} floor lamp(s)`);

  // ---- Protection ----
  const furnitureCuFt = furnitureVolume(items);
  const fragileCuFt = items
    .filter((i) => i.fragile)
    .reduce((sum, i) => sum + i.volumeCuFt * i.quantity, 0);

  push(
    "BUB-750",
    "Bubble wrap 750mm x 100m",
    "roll",
    Math.max(1, Math.ceil(fragileCuFt / 30)),
    `${Math.round(fragileCuFt)} cu ft of fragile goods, 30 cu ft per roll`,
  );

  const paperCartons = plan.medium + plan.book;
  push(
    "PAP-10",
    "Packing paper (acid-free), 10kg",
    "pack",
    Math.max(paperCartons > 0 ? 1 : 0, Math.ceil(paperCartons / 10)),
    `${paperCartons} medium/book carton(s), 1 pack per 10`,
  );

  const cartons = totalCartons(plan);
  push("TAPE-50", "Packing tape 48mm x 66m", "roll", cartons > 0 ? Math.max(3, Math.ceil(cartons / 10)) : 0, `${cartons} carton(s), 1 roll per 10 plus spares`);
  push("MRK", "Marker pen", "each", cartons > 0 ? 3 : 0, "one per packer plus a spare");
  push("LBL", "Room label sheet", "pack", cartons > 0 ? Math.max(1, Math.ceil(cartons / 50)) : 0, "colour coding by room");

  // ---- Covers ----
  const singleBeds = countOf(items, ["bed-single", "cot", "bunk-bed"]);
  const doubleBeds = countOf(items, ["bed-double", "bed-king", "bed-superking", "sofa-bed"]);
  push("COV-MAT-S", "Mattress cover (single)", "each", singleBeds, `${singleBeds} single/bunk bed(s)`);
  push("COV-MAT-D", "Mattress cover (double / king)", "each", doubleBeds, `${doubleBeds} double or larger bed(s)`);

  const sofas = countOf(items, ["sofa-2", "sofa-3", "sofa-corner", "sofa-bed"]);
  const chairs = countOf(items, ["armchair", "recliner"]);
  push("COV-SOFA", "Sofa cover (polythene)", "each", sofas, `${sofas} sofa(s)`);
  push("COV-CHAIR", "Armchair cover (polythene)", "each", chairs, `${chairs} armchair(s)`);

  const appliances = countOf(items, ["fridge-freezer", "fridge-under", "chest-freezer", "washing-machine", "tumble-dryer", "dishwasher", "cooker"]);
  push("COV-APP", "Appliance cover", "each", appliances, `${appliances} white good(s)`);

  // ---- Van and property protection ----
  push(
    "BLK",
    "Furniture blanket",
    "each",
    Math.max(8, Math.ceil(furnitureCuFt / 12)),
    `${Math.round(furnitureCuFt)} cu ft of furniture, 1 blanket per 12 cu ft`,
  );
  push(
    "STR-WRAP",
    "Stretch wrap 500mm",
    "roll",
    Math.max(1, Math.ceil(furnitureCuFt / 150)),
    `${Math.round(furnitureCuFt)} cu ft of furniture, 150 cu ft per roll`,
  );
  push("FLR-PROT", "Floor protection roll (25m)", "roll", 2, "one at each property");
  push("DOOR-PROT", "Door jamb / bannister protector set", "set", 2, "one at each property");

  // ---- Dismantling ----
  const dismantleUnits = items.filter((i) => i.dismantle).reduce((n, i) => n + i.quantity, 0);
  push("BAG-FIX", "Fixings bag (labelled)", "each", dismantleUnits, `${dismantleUnits} item(s) to dismantle`);

  return dedupe(lines, ctx);
}

/** Merge any duplicate SKUs, in case two rules produced the same line. */
function dedupe(lines: MaterialLine[], _ctx: Ctx): MaterialLine[] {
  const merged = new Map<string, MaterialLine>();
  for (const line of lines) {
    const existing = merged.get(line.sku);
    if (existing) {
      existing.quantity += line.quantity;
      existing.basis = `${existing.basis}; ${line.basis}`;
    } else {
      merged.set(line.sku, { ...line });
    }
  }
  return [...merged.values()];
}
