import { test } from "node:test";
import assert from "node:assert/strict";

import { priceSurvey, DEFAULT_RATE_CARD } from "../src/lib/pricing/index.ts";
import type { RateCard } from "../src/lib/pricing/types.ts";
import { estimateSurvey } from "../src/lib/estimate/index.ts";
import { getCatalogEntry } from "../src/lib/catalog.ts";
import { DEFAULT_ACCESS, DEFAULT_JOURNEY } from "../src/lib/types.ts";
import type { InventoryItem, JourneyDetails, RoomSurvey } from "../src/lib/types.ts";

let seq = 0;
function item(catalogId: string, room: string, quantity = 1): InventoryItem {
  const entry = getCatalogEntry(catalogId)!;
  return {
    id: `i${seq++}`,
    room,
    name: entry.name,
    catalogId,
    quantity,
    volumeCuFt: entry.cuFt,
    fragile: entry.fragile,
    twoPersonLift: entry.twoPersonLift,
    dismantle: entry.dismantle,
    packing: entry.packing,
    source: "ai",
  };
}

function survey(items: InventoryItem[], rooms: RoomSurvey[] = [], journey: Partial<JourneyDetails> = {}) {
  const j = { ...DEFAULT_JOURNEY, ...journey };
  const estimate = estimateSurvey({
    items,
    rooms,
    origin: DEFAULT_ACCESS,
    destination: DEFAULT_ACCESS,
    journey: j,
    packingDayBefore: false,
  });
  return { estimate, journey: j };
}

const rates = (overrides: Partial<RateCard> = {}): RateCard => ({
  ...DEFAULT_RATE_CARD,
  ...overrides,
});

const THREE_BED = [
  item("sofa-3", "Lounge"),
  item("armchair", "Lounge", 2),
  item("tv-large", "Lounge"),
  item("bed-double", "Master bedroom"),
  item("wardrobe-2", "Master bedroom"),
  item("bed-single", "Bedroom 2"),
  item("fridge-freezer", "Kitchen"),
  item("washing-machine", "Kitchen"),
  item("dining-table-6", "Dining room"),
  item("dining-chair", "Dining room", 6),
];

test("a quote adds up to its own lines", () => {
  const { estimate, journey } = survey(THREE_BED, [{ name: "Kitchen", packingLevel: "full" }]);
  const quote = priceSurvey(estimate, journey, rates());

  const summed = quote.lines
    .filter((l) => l.section !== "adjustment")
    .reduce((total, line) => total + line.total, 0);

  assert.equal(Math.round(summed * 100) / 100, quote.net);
  assert.equal(quote.subtotal, Math.round((quote.net + quote.adjustment) * 100) / 100);
  assert.equal(quote.total, Math.round((quote.subtotal + quote.vat) * 100) / 100);
});

test("every line's total is its quantity times its unit price", () => {
  // The line a customer queries is the one they can do in their head.
  const { estimate, journey } = survey(THREE_BED, [{ name: "Kitchen", packingLevel: "full" }]);
  const quote = priceSurvey(estimate, journey, rates());

  for (const line of quote.lines) {
    if (line.quantity === null) continue;
    assert.equal(
      line.total,
      Math.round(line.quantity * line.unitPrice * 100) / 100,
      `${line.description}: ${line.quantity} × ${line.unitPrice} ≠ ${line.total}`,
    );
  }
});

test("VAT is charged only when the company is registered", () => {
  const { estimate, journey } = survey(THREE_BED);

  const registered = priceSurvey(estimate, journey, rates({ vatRegistered: true, vatRate: 0.2 }));
  assert.equal(registered.vat, Math.round(registered.subtotal * 0.2 * 100) / 100);
  assert.ok(registered.vat > 0);

  const not = priceSurvey(estimate, journey, rates({ vatRegistered: false, vatRate: 0.2 }));
  assert.equal(not.vat, 0);
  assert.equal(not.total, not.subtotal);
});

test("a bigger job costs more than a smaller one", () => {
  const small = survey([item("sofa-2", "Lounge")]);
  const big = survey(THREE_BED);

  const cheap = priceSurvey(small.estimate, small.journey, rates({ minimumCharge: 0 }));
  const dear = priceSurvey(big.estimate, big.journey, rates({ minimumCharge: 0 }));

  assert.ok(dear.total > cheap.total, `${dear.total} should exceed ${cheap.total}`);
});

test("packing a house costs more than not packing it", () => {
  const rooms: RoomSurvey[] = [
    { name: "Kitchen", packingLevel: "none" },
    { name: "Lounge", packingLevel: "none" },
  ];
  const selfPack = survey(THREE_BED, rooms);
  const weePack = survey(THREE_BED, [
    { name: "Kitchen", packingLevel: "full" },
    { name: "Lounge", packingLevel: "full" },
  ]);

  const a = priceSurvey(selfPack.estimate, selfPack.journey, rates());
  const b = priceSurvey(weePack.estimate, weePack.journey, rates());

  assert.ok(b.total > a.total, "packing service must show up in the price");
});

test("the minimum hours, not the charge floor, is what usually lifts a small job", () => {
  // Two cartons is nothing, but a crew and a van still go out for half a day.
  // The hours rule gets there on its own, so the charge floor stays out of it.
  const { estimate, journey } = survey([item("carton-med", "Lounge", 2)]);
  const quote = priceSurvey(estimate, journey, rates({ minimumCharge: 350 }));

  assert.ok(quote.subtotal > 350, `${quote.subtotal} is already above the floor`);
  assert.equal(quote.minimumApplied, true, "the hours were still lifted to the minimum");

  const labour = quote.lines.find((l) => l.section === "labour")!;
  assert.equal(labour.quantity, 4 * estimate.crew.crewSize);
  assert.match(labour.basis, /minimum/);
});

test("the charge floor catches anything the hours rule leaves too cheap", () => {
  const { estimate, journey } = survey([item("carton-med", "Lounge", 2)]);
  const quote = priceSurvey(estimate, journey, rates({ minimumCharge: 2000 }));

  assert.equal(quote.subtotal, 2000);
  assert.equal(quote.minimumApplied, true);
  assert.ok(
    quote.warnings.some((w) => w.includes("minimum charge")),
    "the surveyor has to know the price is the floor, not the work",
  );
});

test("the minimum charge does not cap a job that exceeds it", () => {
  const { estimate, journey } = survey(THREE_BED, [{ name: "Kitchen", packingLevel: "full" }]);
  const quote = priceSurvey(estimate, journey, rates({ minimumCharge: 350 }));

  assert.ok(quote.subtotal > 350);
  assert.equal(quote.net, Math.round(quote.net * 100) / 100);
});

test("minimum chargeable hours apply per crew member, not per job", () => {
  // Four hours minimum for a crew of three is twelve man-hours, not four.
  const { estimate, journey } = survey([item("sofa-2", "Lounge")]);
  const quote = priceSurvey(
    estimate,
    journey,
    rates({ minimumChargeableHours: 4, minimumCharge: 0 }),
  );

  const labour = quote.lines.find((l) => l.section === "labour")!;
  assert.equal(labour.quantity, 4 * estimate.crew.crewSize);
});

test("an unpriced material is flagged rather than quietly quoted at nothing", () => {
  const { estimate, journey } = survey(THREE_BED, [{ name: "Kitchen", packingLevel: "full" }]);
  const withHole = rates({ materialPrices: { ...DEFAULT_RATE_CARD.materialPrices } });
  delete withHole.materialPrices["CTN-MD"];

  const quote = priceSurvey(estimate, journey, withHole);
  assert.ok(
    quote.warnings.some((w) => w.includes("CTN-MD")),
    "a missing price must not silently discount the quote",
  );
});

test("crew kit priced at nothing is not reported as a missing price", () => {
  // Blankets and door protectors go out and come back. Zero is the answer,
  // not an omission, and crying wolf about them trains people to ignore the
  // warnings that matter.
  const { estimate, journey } = survey(THREE_BED);
  const quote = priceSurvey(estimate, journey, rates());

  assert.equal(
    quote.warnings.some((w) => w.includes("BLK") || w.includes("DOOR-PROT")),
    false,
    quote.warnings.join(" | "),
  );
});

test("materials markup is applied to cost", () => {
  const { estimate, journey } = survey(THREE_BED, [{ name: "Kitchen", packingLevel: "full" }]);

  const atCost = priceSurvey(estimate, journey, rates({ materialsMarkup: 0 }));
  const marked = priceSurvey(estimate, journey, rates({ materialsMarkup: 0.25 }));

  const sum = (q: typeof atCost) =>
    q.lines.filter((l) => l.section === "materials").reduce((n, l) => n + l.total, 0);

  assert.ok(sum(marked) > sum(atCost));
  // Line by line, allowing for per-line rounding of the unit price.
  assert.ok(Math.abs(sum(marked) - sum(atCost) * 1.25) < 1);
});

test("mileage covers the depot run and every van", () => {
  const one = survey([item("sofa-3", "Lounge")], [], { distanceMiles: 100, depotToOriginMiles: 10 });
  const quote = priceSurvey(one.estimate, one.journey, rates({ mileageRate: 1 }));

  const travel = quote.lines.find((l) => l.section === "travel")!;
  const vans = one.estimate.crew.vehicles.reduce((n, v) => n + v.count, 0);
  // 100 loaded + 20 depot (out and back), per van.
  assert.equal(travel.quantity, 120 * vans);
});

test("a discount is a negative adjustment and moves the total", () => {
  const { estimate, journey } = survey(THREE_BED);

  const full = priceSurvey(estimate, journey, rates({ minimumCharge: 0 }));
  const cut = priceSurvey(
    estimate,
    journey,
    rates({ adjustment: -0.1, adjustmentReason: "Repeat customer", minimumCharge: 0 }),
  );

  assert.ok(cut.adjustment < 0);
  assert.equal(cut.subtotal, Math.round((full.net + cut.adjustment) * 100) / 100);
  assert.ok(cut.lines.some((l) => l.description === "Repeat customer"));
});

test("crew warnings reach the quote", () => {
  // A piano is not something to send out on an automatic number.
  const { estimate, journey } = survey([item("piano-upright", "Lounge"), item("sofa-3", "Lounge")]);
  const quote = priceSurvey(estimate, journey, rates());

  assert.ok(estimate.crew.warnings.length > 0, "precondition: the crew planner flagged it");
  for (const warning of estimate.crew.warnings) {
    assert.ok(quote.warnings.includes(warning), `"${warning}" must reach whoever sends the quote`);
  }
});

test("a vehicle with no day rate is flagged", () => {
  const { estimate, journey } = survey(THREE_BED);
  const quote = priceSurvey(estimate, journey, rates({ vehicleDayRate: {} }));

  assert.ok(quote.warnings.some((w) => w.includes("day rate")), quote.warnings.join(" | "));
});

test("the same survey and rate card always give the same quote", () => {
  const { estimate, journey } = survey(THREE_BED, [{ name: "Kitchen", packingLevel: "full" }]);
  const a = priceSurvey(estimate, journey, rates());
  const b = priceSurvey(estimate, journey, rates());
  assert.deepEqual(a, b);
});

test("money never carries fractions of a penny", () => {
  const { estimate, journey } = survey(THREE_BED, [
    { name: "Kitchen", packingLevel: "full" },
    { name: "Master bedroom", packingLevel: "part" },
  ]);
  const quote = priceSurvey(estimate, journey, rates({ materialsMarkup: 0.175, adjustment: 0.0333 }));

  const pennies = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
  for (const line of quote.lines) assert.ok(pennies(line.total), `${line.description}: ${line.total}`);
  for (const value of [quote.net, quote.adjustment, quote.subtotal, quote.vat, quote.total]) {
    assert.ok(pennies(value), String(value));
  }
});
