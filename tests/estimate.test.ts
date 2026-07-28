import { test } from "node:test";
import assert from "node:assert/strict";

import { matchCatalog, getCatalogEntry } from "../src/lib/catalog.ts";
import { estimateSurvey } from "../src/lib/estimate/index.ts";
import { accessFactor, planVehicles, computeDrivingHours } from "../src/lib/estimate/crew.ts";
import { cartonPlan, CARTON_SPECS, CARTON_VOLUME_CUFT } from "../src/lib/estimate/cartons.ts";
import { computeMaterials } from "../src/lib/estimate/materials.ts";
import { offlineAnalyse } from "../src/lib/analysis/offline.ts";
import { normaliseAnalysis } from "../src/lib/analysis/normalise.ts";
import { DEFAULT_ACCESS, DEFAULT_JOURNEY } from "../src/lib/types.ts";
import type { AccessDetails, InventoryItem, RoomSurvey, SurveyInput } from "../src/lib/types.ts";

let counter = 0;

function item(catalogId: string, room: string, quantity = 1): InventoryItem {
  const entry = getCatalogEntry(catalogId);
  if (!entry) throw new Error(`Unknown catalogue id: ${catalogId}`);
  return {
    id: `item-${++counter}`,
    room,
    name: entry.name,
    catalogId: entry.id,
    quantity,
    volumeCuFt: entry.cuFt,
    fragile: entry.fragile,
    twoPersonLift: entry.twoPersonLift,
    dismantle: entry.dismantle,
    packing: entry.packing,
    source: "manual",
  };
}

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  return {
    items: [],
    rooms: [],
    origin: { ...DEFAULT_ACCESS },
    destination: { ...DEFAULT_ACCESS },
    journey: { ...DEFAULT_JOURNEY },
    packingDayBefore: false,
    ...overrides,
  };
}

// ---- Catalogue ----

test("matches the words a customer actually uses onto the catalogue", () => {
  assert.equal(matchCatalog("three seater sofa")?.id, "sofa-3");
  assert.equal(matchCatalog("settee", "Lounge")?.id, "sofa-3");
  assert.equal(matchCatalog("double wardrobe", "Master bedroom")?.id, "wardrobe-2");
  assert.equal(matchCatalog("fridge freezer", "Kitchen")?.id, "fridge-freezer");
  assert.equal(matchCatalog("washing machine")?.id, "washing-machine");
  assert.equal(matchCatalog("large bookcase")?.id, "bookcase-lg");
});

test("returns nothing rather than a bad guess for unknown items", () => {
  assert.equal(matchCatalog("hovercraft"), undefined);
  assert.equal(matchCatalog(""), undefined);
});

test("uses the room to break a tie between plausible matches", () => {
  assert.equal(matchCatalog("chair", "Dining room")?.rooms.includes("dining"), true);
});

// ---- Volume ----

test("volume totals furniture and adds the cartons it will take to pack", () => {
  const rooms: RoomSurvey[] = [{ name: "Lounge", packingLevel: "none" }];
  const items = [item("sofa-3", "Lounge"), item("armchair", "Lounge", 2)];

  const bare = estimateSurvey(survey({ items, rooms }));
  // 45 + 2 x 20, no packing service so no cartons.
  assert.equal(bare.volume.furnitureCuFt, 85);
  assert.equal(bare.volume.cartonCuFt, 0);
  assert.equal(bare.volume.totalCuFt, 85);

  const packed = estimateSurvey(
    survey({ items, rooms: [{ name: "Lounge", packingLevel: "full" }] }),
  );
  assert.ok(packed.volume.cartonCuFt > 0, "a full pack must add carton volume");
  assert.equal(packed.volume.totalCuFt, packed.volume.furnitureCuFt + packed.volume.cartonCuFt);
});

test("per-room volumes add up to the total", () => {
  const rooms: RoomSurvey[] = [
    { name: "Kitchen", packingLevel: "full" },
    { name: "Master bedroom", packingLevel: "part" },
  ];
  const items = [
    item("fridge-freezer", "Kitchen"),
    item("bed-double", "Master bedroom"),
    item("wardrobe-2", "Master bedroom"),
  ];

  const { volume } = estimateSurvey(survey({ items, rooms }));
  const summed = volume.byRoom.reduce((n, row) => n + row.cuFt, 0);
  assert.ok(Math.abs(summed - volume.totalCuFt) < 0.5, `${summed} should equal ${volume.totalCuFt}`);
});

test("cubic metres track cubic feet", () => {
  const { volume } = estimateSurvey(
    survey({ items: [item("sofa-3", "Lounge")], rooms: [{ name: "Lounge", packingLevel: "none" }] }),
  );
  assert.ok(Math.abs(volume.totalCubicMetres - 45 / 35.3147) < 0.01);
});

// ---- Cartons ----

test("no cartons are supplied when the customer packs their own", () => {
  const plan = cartonPlan(
    [item("kitchen-cupboards", "Kitchen")],
    [{ name: "Kitchen", packingLevel: "none" }],
  );
  assert.equal(plan.large + plan.medium + plan.book + plan.wardrobe, 0);
});

test("a part pack is materially smaller than a full pack", () => {
  const items = [item("kitchen-cupboards", "Kitchen")];
  const full = cartonPlan(items, [{ name: "Kitchen", packingLevel: "full" }]);
  const part = cartonPlan(items, [{ name: "Kitchen", packingLevel: "part" }]);
  assert.ok(part.medium < full.medium, "part pack should need fewer cartons");
  assert.ok(part.medium > 0, "part pack still needs some cartons");
});

test("wardrobe cartons follow the wardrobes, and only when we are packing", () => {
  const items = [item("wardrobe-2", "Bedroom", 2)];

  const packing = cartonPlan(items, [{ name: "Bedroom", packingLevel: "full" }]);
  assert.equal(packing.wardrobe, 6, "3 wardrobe cartons per double wardrobe");

  const selfPack = cartonPlan(items, [{ name: "Bedroom", packingLevel: "none" }]);
  assert.equal(selfPack.wardrobe, 0);
});

// ---- Materials ----

test("materials cover the beds, sofas and televisions in the inventory", () => {
  const items = [
    item("bed-double", "Bedroom"),
    item("bed-single", "Bedroom 2"),
    item("sofa-3", "Lounge"),
    item("armchair", "Lounge", 2),
    item("tv-large", "Lounge"),
  ];
  const rooms: RoomSurvey[] = [
    { name: "Bedroom", packingLevel: "none" },
    { name: "Bedroom 2", packingLevel: "none" },
    { name: "Lounge", packingLevel: "none" },
  ];

  const materials = computeMaterials(items, rooms);
  const qty = (sku: string) => materials.find((m) => m.sku === sku)?.quantity ?? 0;

  assert.equal(qty("COV-MAT-D"), 1);
  assert.equal(qty("COV-MAT-S"), 1);
  assert.equal(qty("COV-SOFA"), 1);
  assert.equal(qty("COV-CHAIR"), 2);
  assert.equal(qty("BOX-TV"), 1);
  assert.ok(qty("BLK") >= 8, "always send a working set of blankets");
});

test("every materials line explains where its quantity came from", () => {
  const materials = computeMaterials(
    [item("fridge-freezer", "Kitchen")],
    [{ name: "Kitchen", packingLevel: "full" }],
  );
  assert.ok(materials.length > 0);
  for (const line of materials) {
    assert.ok(line.basis.trim().length > 0, `${line.sku} has no stated basis`);
    assert.ok(line.quantity > 0, `${line.sku} was listed with no quantity`);
  }
});

test("fixings bags are issued per item that has to come apart", () => {
  const materials = computeMaterials(
    [item("bed-double", "Bedroom", 2), item("wardrobe-2", "Bedroom")],
    [{ name: "Bedroom", packingLevel: "none" }],
  );
  assert.equal(materials.find((m) => m.sku === "BAG-FIX")?.quantity, 3);
});

// ---- Access ----

test("ground floor with the van outside is the reference case", () => {
  assert.equal(accessFactor({ ...DEFAULT_ACCESS, carryDistanceM: 10 }), 1);
});

test("stairs cost more than a lift, and higher floors cost more than lower", () => {
  const stairs2: AccessDetails = { ...DEFAULT_ACCESS, floor: 2 };
  const lift2: AccessDetails = { ...DEFAULT_ACCESS, floor: 2, liftAvailable: true };
  const stairs4: AccessDetails = { ...DEFAULT_ACCESS, floor: 4 };

  assert.ok(accessFactor(stairs2) < accessFactor(lift2));
  assert.ok(accessFactor(stairs4) < accessFactor(stairs2));
});

test("a long carry, restricted parking and a hoist all slow the crew down", () => {
  const base = accessFactor(DEFAULT_ACCESS);
  assert.ok(accessFactor({ ...DEFAULT_ACCESS, carryDistanceM: 80 }) < base);
  assert.ok(accessFactor({ ...DEFAULT_ACCESS, parkingRestricted: true }) < base);
  assert.ok(accessFactor({ ...DEFAULT_ACCESS, hoistRequired: true }) < base);
});

test("access factors never fall outside the range the model is calibrated for", () => {
  const worst = accessFactor({
    floor: 4,
    liftAvailable: false,
    carryDistanceM: 500,
    parkingRestricted: true,
    hoistRequired: true,
    awkwardStairs: true,
  });
  assert.ok(worst >= 0.3 && worst <= 1, `factor ${worst} out of range`);
});

// ---- Labour and crew ----

test("bad access adds loading time for the same goods", () => {
  const items = [item("sofa-3", "Lounge"), item("bed-double", "Bedroom")];
  const rooms: RoomSurvey[] = [
    { name: "Lounge", packingLevel: "none" },
    { name: "Bedroom", packingLevel: "none" },
  ];

  const easy = estimateSurvey(survey({ items, rooms }));
  const hard = estimateSurvey(
    survey({
      items,
      rooms,
      origin: { ...DEFAULT_ACCESS, floor: 3, carryDistanceM: 60, parkingRestricted: true },
    }),
  );

  assert.ok(hard.labour.loadHours > easy.labour.loadHours * 1.5, "third floor should cost real time");
  assert.equal(hard.labour.unloadHours, easy.labour.unloadHours, "delivery access is unchanged");
});

test("a small flat move is a two-man job", () => {
  const result = estimateSurvey(
    survey({
      items: [item("sofa-2", "Lounge"), item("bed-double", "Bedroom"), item("carton-med", "Lounge", 20)],
      rooms: [
        { name: "Lounge", packingLevel: "none" },
        { name: "Bedroom", packingLevel: "none" },
      ],
    }),
  );

  assert.equal(result.crew.crewSize, 2);
  assert.equal(result.crew.moveDays, 1);
  assert.equal(result.crew.vehicles.length, 1);
});

test("a full house needs more crew than a flat", () => {
  const rooms: RoomSurvey[] = [
    { name: "Lounge", packingLevel: "full" },
    { name: "Kitchen", packingLevel: "full" },
    { name: "Master bedroom", packingLevel: "full" },
    { name: "Bedroom 2", packingLevel: "full" },
    { name: "Garage", packingLevel: "full" },
  ];
  const items = [
    item("sofa-corner", "Lounge"),
    item("armchair", "Lounge", 2),
    item("tv-xl", "Lounge"),
    item("bookcase-lg", "Lounge", 2),
    item("fridge-freezer", "Kitchen"),
    item("washing-machine", "Kitchen"),
    item("dishwasher", "Kitchen"),
    item("kitchen-table", "Kitchen"),
    item("kitchen-chair", "Kitchen", 6),
    item("bed-superking", "Master bedroom"),
    item("wardrobe-3", "Master bedroom"),
    item("chest-5", "Master bedroom", 2),
    item("bed-double", "Bedroom 2"),
    item("wardrobe-2", "Bedroom 2"),
    item("workbench", "Garage"),
    item("bicycle", "Garage", 3),
  ];

  const result = estimateSurvey(survey({ items, rooms }));

  assert.ok(result.volume.totalCuFt > 600, `expected a substantial load, got ${result.volume.totalCuFt}`);
  assert.ok(result.crew.crewSize >= 3, `expected 3+ crew, got ${result.crew.crewSize}`);
  assert.ok(result.crew.drivers.length > 0, "crew size increases should be explained");
});

test("packing the day before takes packing off moving day", () => {
  const rooms: RoomSurvey[] = [
    { name: "Kitchen", packingLevel: "full" },
    { name: "Lounge", packingLevel: "full" },
  ];
  const items = [item("fridge-freezer", "Kitchen"), item("sofa-3", "Lounge")];

  const sameDay = estimateSurvey(survey({ items, rooms, packingDayBefore: false }));
  const dayBefore = estimateSurvey(survey({ items, rooms, packingDayBefore: true }));

  assert.equal(dayBefore.crew.packingDays >= 1, true);
  assert.equal(sameDay.crew.packingDays, 0);
  assert.equal(sameDay.labour.packingHours, dayBefore.labour.packingHours);
});

test("specialist items are flagged rather than silently priced", () => {
  const result = estimateSurvey(
    survey({
      items: [item("piano-upright", "Lounge")],
      rooms: [{ name: "Lounge", packingLevel: "none" }],
    }),
  );
  assert.ok(result.crew.warnings.some((w) => w.toLowerCase().includes("specialist")));
});

test("a hoist puts an extra pair of hands on the job", () => {
  const items = [item("sofa-3", "Lounge")];
  const rooms: RoomSurvey[] = [{ name: "Lounge", packingLevel: "none" }];

  const normal = estimateSurvey(survey({ items, rooms }));
  const hoisted = estimateSurvey(
    survey({ items, rooms, origin: { ...DEFAULT_ACCESS, floor: 2, hoistRequired: true } }),
  );

  assert.ok(hoisted.crew.crewSize > normal.crew.crewSize);
});

test("an empty survey produces no crew drivers, no van and no volume", () => {
  const result = estimateSurvey(survey());
  assert.equal(result.volume.totalCuFt, 0);
  assert.equal(result.crew.vehicles.length, 0);
});

// ---- Vehicles ----

test("vehicles are sized to carry the load in one trip", () => {
  assert.deepEqual(planVehicles(400), [
    { type: "Luton box van", capacityCuFt: 600, count: 1 },
  ]);

  const midsize = planVehicles(900);
  assert.equal(midsize.length, 1);
  assert.equal(midsize[0].type, "7.5t box van");

  const large = planVehicles(2500);
  const capacity = large.reduce((n, v) => n + v.capacityCuFt * v.count, 0);
  assert.ok(capacity >= 2500, `capacity ${capacity} must hold the load`);
});

test("every vehicle plan has room for the goods", () => {
  for (const volume of [50, 599, 601, 1099, 1101, 1999, 2001, 3500, 6000]) {
    const capacity = planVehicles(volume).reduce(
      (n, v) => n + v.capacityCuFt * v.count,
      0,
    );
    assert.ok(capacity >= volume, `${volume} cu ft was given only ${capacity} cu ft of van`);
  }
});

// ---- Journey ----

test("driving time covers the depot legs, not just the loaded leg", () => {
  const hours = computeDrivingHours({ distanceMiles: 32, roadType: "mixed", depotToOriginMiles: 16 });
  // (16 + 32) out and the same back, at 32 mph.
  assert.ok(Math.abs(hours - 3) < 0.01, `expected 3 hours, got ${hours}`);
});

test("a long-distance move is called out as one", () => {
  const result = estimateSurvey(
    survey({
      items: [item("sofa-3", "Lounge")],
      rooms: [{ name: "Lounge", packingLevel: "none" }],
      journey: { distanceMiles: 320, roadType: "motorway", depotToOriginMiles: 20 },
    }),
  );
  assert.ok(result.crew.warnings.length > 0, "a 320-mile move should raise something");
});

// ---- Offline analysis ----

test("the offline estimator reads rooms and items out of a narration", () => {
  const transcript = `
    So this is the lounge. We've got a three seater sofa and two armchairs.
    The TV is staying, that's not coming with us.
    Through here is the kitchen. There's a fridge freezer and a washing machine.
    Can you pack the kitchen for us please.
    Upstairs in the master bedroom there's a double bed and a double wardrobe.
    We'll do our own boxes in the bedroom.
  `;

  const raw = offlineAnalyse(transcript);
  const { items, rooms } = normaliseAnalysis(raw);

  const names = items.map((i) => i.name);
  assert.ok(names.includes("3-seater sofa"), `expected a sofa in ${names.join(", ")}`);
  assert.ok(names.includes("Fridge freezer"));
  assert.ok(names.includes("Double bed + mattress"));

  const kitchen = rooms.find((r) => r.name === "Kitchen");
  assert.equal(kitchen?.packingLevel, "full", "'can you pack the kitchen' is a full pack");

  const bedroom = rooms.find((r) => r.name.toLowerCase().includes("bedroom"));
  assert.equal(bedroom?.packingLevel, "none", "'we'll do our own boxes' is customer packing");
});

test("the offline estimator counts quantities stated in words or digits", () => {
  const raw = offlineAnalyse("In the dining room there are six dining chairs and 2 armchairs.");
  const chairs = raw.items.find((i) => i.name === "Dining chair");
  const armchairs = raw.items.find((i) => i.name === "Armchair");
  assert.equal(chairs?.quantity, 6);
  assert.equal(armchairs?.quantity, 2);
});

test("the offline estimator is loud about being a fallback", () => {
  const raw = offlineAnalyse("There is a sofa in the lounge.");
  assert.ok(
    raw.flags.some((f) => f.includes("ANTHROPIC_API_KEY")),
    "the fallback must say it did not read the video",
  );
});

test("an empty transcript yields nothing rather than an invented inventory", () => {
  const raw = offlineAnalyse("");
  assert.equal(raw.items.length, 0);
  assert.equal(raw.rooms.length, 0);
});

test("items the customer says are staying are not added to the inventory", () => {
  const raw = offlineAnalyse("This is the lounge. The piano is staying, we're not taking it.");
  assert.ok(!raw.items.some((i) => i.name.toLowerCase().includes("piano")));
});

// ---- Normalisation ----

test("normalising snaps loose descriptions onto catalogue volumes", () => {
  const { items } = normaliseAnalysis({
    summary: "",
    rooms: [{ name: "Lounge", packingLevel: "none" }],
    items: [
      { room: "Lounge", name: "big three seater settee", quantity: 1, fragile: false, dismantle: false, confidence: 0.9 },
    ],
    flags: [],
  });

  assert.equal(items[0].catalogId, "sofa-3");
  assert.equal(items[0].volumeCuFt, 45);
  assert.ok(items[0].notes?.includes("big three seater settee"), "keeps the customer's own words");
});

test("an unmatched item keeps the analyser's own volume estimate", () => {
  const { items } = normaliseAnalysis({
    summary: "",
    rooms: [],
    items: [
      { room: "Garage", name: "kiln", quantity: 1, estimatedCuFt: 26, fragile: false, dismantle: false, confidence: 0.5 },
    ],
    flags: [],
  });

  assert.equal(items[0].catalogId, null);
  assert.equal(items[0].volumeCuFt, 26);
});

test("a room referenced only by an item still gets a packing decision", () => {
  const { rooms } = normaliseAnalysis({
    summary: "",
    rooms: [{ name: "Lounge", packingLevel: "full" }],
    items: [{ room: "Loft", name: "boxes", quantity: 4, fragile: false, dismantle: false, confidence: 0.4 }],
    flags: [],
  });

  assert.ok(rooms.some((r) => r.name === "Loft"));
});

test("who packs is understood however the customer phrases it", () => {
  const cases: Array<[string, "none" | "part" | "full"]> = [
    ["This is the kitchen. We will do our own boxes in the kitchen.", "none"],
    ["This is the kitchen. We'll do our own packing.", "none"],
    ["This is the kitchen. We've packed it all already.", "none"],
    ["This is the kitchen. Can you pack the kitchen for us please.", "full"],
    ["This is the kitchen. Could you pack everything in here.", "full"],
    ["This is the kitchen. Just the fragile things please.", "part"],
  ];

  for (const [transcript, expected] of cases) {
    const raw = offlineAnalyse(transcript);
    const kitchen = raw.rooms.find((r) => r.name === "Kitchen");
    assert.equal(kitchen?.packingLevel, expected, `"${transcript}" should read as ${expected}`);
  }
});

test("stating who packs does not add a phantom carton to the inventory", () => {
  const raw = offlineAnalyse("This is the lounge. We will do our own boxes in the lounge.");
  assert.equal(raw.items.length, 0, `unexpected items: ${raw.items.map((i) => i.name).join(", ")}`);
});

test("a real item named in a packing sentence is still counted", () => {
  const raw = offlineAnalyse("This is the dining room. Can you pack the display cabinet please.");
  assert.ok(raw.items.some((i) => i.name === "Display cabinet"));
});

test("size qualifiers pick the right line, not the generic alias", () => {
  // "bed" is an alias of the double. Without qualifier awareness it outscores
  // the single's own name, and a single bed gets priced at 45 cu ft.
  assert.equal(matchCatalog("single bed")?.id, "bed-single");
  assert.equal(matchCatalog("double bed")?.id, "bed-double");
  assert.equal(matchCatalog("king bed")?.id, "bed-king");
  assert.equal(matchCatalog("super king bed")?.id, "bed-superking");
  assert.equal(matchCatalog("bunk bed")?.id, "bunk-bed");

  // Same trap with "wardrobe" and "sofa".
  assert.equal(matchCatalog("single wardrobe")?.id, "wardrobe-1");
  assert.equal(matchCatalog("triple wardrobe")?.id, "wardrobe-3");
  assert.equal(matchCatalog("corner sofa")?.id, "sofa-corner");
  assert.equal(matchCatalog("small bookcase")?.id, "bookcase-sm");
  assert.equal(matchCatalog("large bookcase")?.id, "bookcase-lg");
});

test("an unqualified word still falls back to the commonest size", () => {
  assert.equal(matchCatalog("bed")?.id, "bed-double");
  assert.equal(matchCatalog("wardrobe")?.id, "wardrobe-2");
  assert.equal(matchCatalog("sofa")?.id, "sofa-3");
});

test("a single bed is never priced as a double", () => {
  const single = matchCatalog("single bed")!;
  const double = matchCatalog("double bed")!;
  assert.equal(single.cuFt, 30);
  assert.equal(double.cuFt, 45);
  assert.notEqual(single.id, double.id);
});

test("carton volumes are the cartons' actual dimensions", () => {
  // Pinned absolutely, not relatively. Every other carton test here compares
  // one figure to another — which is exactly why the large carton sat at 3 cu
  // ft against real dimensions of 4.5 without a single test noticing.
  assert.equal(CARTON_VOLUME_CUFT.large, 4.5, "610 x 457 x 457 mm");
  assert.equal(CARTON_VOLUME_CUFT.medium, 2.99, "457 x 457 x 406 mm");
  assert.equal(CARTON_VOLUME_CUFT.book, 1.5, "457 x 305 x 305 mm");
  assert.equal(CARTON_VOLUME_CUFT.wardrobe, 9.99, "508 x 457 x 1219 mm");
});

test("every carton volume is derived from its own dimensions", () => {
  for (const type of ["large", "medium", "book", "wardrobe"] as const) {
    const [l, w, d] = CARTON_SPECS[type].mm;
    const expected = Math.round(((l * w * d) / 1e9) * 35.3147 * 100) / 100;
    assert.equal(CARTON_VOLUME_CUFT[type], expected, `${type} must follow its dimensions`);
  }
});

test("a carton the customer packed is the same size as one we packed", () => {
  // The volume of a box does not depend on whose hands filled it.
  assert.equal(getCatalogEntry("carton-lg")?.cuFt, CARTON_VOLUME_CUFT.large);
  assert.equal(getCatalogEntry("carton-med")?.cuFt, CARTON_VOLUME_CUFT.medium);
  assert.equal(getCatalogEntry("carton-book")?.cuFt, CARTON_VOLUME_CUFT.book);
});
