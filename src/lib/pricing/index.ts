import type { JourneyDetails, SurveyEstimate } from "../types";
import { REUSABLE_SKUS } from "./defaults";
import type { Quote, QuoteLine, RateCard } from "./types";

/** Money is rounded once, at the point it becomes a line, not at the end. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Price an estimate.
 *
 * Pure, like everything else downstream of the inventory: the same survey and
 * the same rate card always produce the same quote, and correcting an item
 * moves the price immediately because nothing is stored.
 */
export function priceSurvey(
  estimate: SurveyEstimate,
  journey: JourneyDetails,
  rates: RateCard,
): Quote {
  const lines: QuoteLine[] = [];
  const warnings: string[] = [];

  // ---- Labour ----
  const { labour, crew } = estimate;
  const workedHours = labour.totalManHours;
  const minimumHours = rates.minimumChargeableHours * crew.crewSize;
  const chargeableHours = Math.max(workedHours, minimumHours);
  const minimumApplied = chargeableHours > workedHours;

  lines.push({
    section: "labour",
    description: `Removal crew — ${crew.crewSize} ${crew.crewSize === 1 ? "person" : "people"}`,
    quantity: round1(chargeableHours),
    unit: "man-hours",
    unitPrice: rates.crewHourlyRate,
    total: money(chargeableHours * rates.crewHourlyRate),
    basis: minimumApplied
      ? `${round1(workedHours)} man-hours of work, charged at the ${rates.minimumChargeableHours}-hour minimum per person`
      : describeLabour(estimate),
  });

  // ---- Vehicles ----
  const days = Math.max(1, crew.moveDays) + crew.packingDays;
  for (const vehicle of crew.vehicles) {
    const rate = rates.vehicleDayRate[vehicle.type];
    if (rate === undefined) {
      warnings.push(
        `No day rate is set for a ${vehicle.type}, so it has been quoted at nothing. Add it to the rate card before this goes out.`,
      );
    }
    const vehicleDays = vehicle.count * days;
    lines.push({
      section: "vehicles",
      description: vehicle.type,
      quantity: vehicleDays,
      unit: vehicleDays === 1 ? "day" : "vehicle-days",
      unitPrice: rate ?? 0,
      total: money(vehicleDays * (rate ?? 0)),
      basis: `${vehicle.count} × ${vehicle.type} at ${vehicle.capacityCuFt} cu ft, over ${days} day(s)`,
    });
  }

  // ---- Travel ----
  const vanCount = crew.vehicles.reduce((n, v) => n + v.count, 0);
  const loadedMiles = journey.distanceMiles;
  const depotMiles = journey.depotToOriginMiles * 2;
  const totalMiles = (loadedMiles + depotMiles) * Math.max(1, vanCount);

  if (totalMiles > 0 && rates.mileageRate > 0) {
    lines.push({
      section: "travel",
      description: "Mileage",
      quantity: Math.round(totalMiles),
      unit: "miles",
      unitPrice: rates.mileageRate,
      total: money(totalMiles * rates.mileageRate),
      basis:
        `${loadedMiles} miles collection to delivery plus ${depotMiles} depot miles, ` +
        `× ${Math.max(1, vanCount)} vehicle(s)`,
    });
  }

  // ---- Materials ----
  const unpriced: string[] = [];
  for (const material of estimate.materials) {
    const cost = rates.materialPrices[material.sku];

    if (cost === undefined) {
      unpriced.push(material.sku);
    }

    const unitPrice = money((cost ?? 0) * (1 + rates.materialsMarkup));
    lines.push({
      section: "materials",
      description: material.name,
      quantity: material.quantity,
      unit: material.unit,
      unitPrice,
      total: money(material.quantity * unitPrice),
      basis: material.basis,
    });
  }

  const missing = unpriced.filter((sku) => !REUSABLE_SKUS.includes(sku));
  if (missing.length > 0) {
    warnings.push(
      `No price is set for ${missing.join(", ")}, so ${missing.length === 1 ? "it has" : "they have"} been quoted at nothing. Add ${missing.length === 1 ? "it" : "them"} to the rate card.`,
    );
  }

  // ---- Totals ----
  const net = money(lines.reduce((sum, line) => sum + line.total, 0));

  const adjustmentValue = money(net * rates.adjustment);
  if (adjustmentValue !== 0) {
    lines.push({
      section: "adjustment",
      description: rates.adjustmentReason || (adjustmentValue > 0 ? "Adjustment" : "Discount"),
      quantity: null,
      unit: "",
      unitPrice: adjustmentValue,
      total: adjustmentValue,
      basis: `${(rates.adjustment * 100).toFixed(1)}% of ${net.toFixed(2)}`,
    });
  }

  let subtotal = money(net + adjustmentValue);
  let minimumChargeApplied = false;

  if (subtotal < rates.minimumCharge) {
    minimumChargeApplied = true;
    subtotal = money(rates.minimumCharge);
  }

  const vat = rates.vatRegistered ? money(subtotal * rates.vatRate) : 0;

  // Anything the crew planner already flagged is a pricing problem too — a
  // piano or a day that will not fit in a day is not something to send out on
  // an automatic number.
  for (const warning of crew.warnings) warnings.push(warning);

  if (minimumChargeApplied) {
    warnings.push(
      `The work came to ${net.toFixed(2)} and has been raised to the ${rates.minimumCharge.toFixed(2)} minimum charge.`,
    );
  }

  return {
    currency: rates.currency,
    lines,
    net,
    adjustment: adjustmentValue,
    subtotal,
    vat,
    total: money(subtotal + vat),
    warnings,
    minimumApplied: minimumApplied || minimumChargeApplied,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeLabour(estimate: SurveyEstimate): string {
  const l = estimate.labour;
  const parts: Array<[string, number]> = [
    ["packing", l.packingHours],
    ["dismantling", l.dismantleHours],
    ["loading", l.loadHours],
    ["unloading", l.unloadHours],
    ["reassembly", l.reassembleHours],
    ["driving", l.drivingHours],
  ];

  return parts
    .filter(([, hours]) => hours > 0.05)
    .map(([name, hours]) => `${name} ${round1(hours)}h`)
    .join(", ");
}

export { DEFAULT_RATE_CARD, REUSABLE_SKUS } from "./defaults";
export type { Quote, QuoteLine, RateCard } from "./types";
