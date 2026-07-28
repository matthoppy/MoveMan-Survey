import { z } from "zod";
import { DEFAULT_RATE_CARD } from "./defaults";
import type { RateCard } from "./types";

/** Rates are money. A negative one is a typo, not a discount. */
const money = z.number().finite().min(0);

export const rateCardSchema = z.object({
  currency: z.string().min(1).max(8),

  crewHourlyRate: money,
  minimumChargeableHours: z.number().finite().min(0).max(24),

  vehicleDayRate: z.record(z.string(), money),
  mileageRate: money,

  materialPrices: z.record(z.string(), money),
  // A markup over 300% is almost certainly 25 typed instead of 0.25, and it
  // would go out as a quote ten times too high.
  materialsMarkup: z.number().finite().min(0).max(3),

  // Both directions: positive loads the job, negative discounts it. Bounded so
  // a stray keystroke cannot zero a quote or triple it.
  adjustment: z.number().finite().min(-0.9).max(3),
  adjustmentReason: z.string().max(200),

  vatRegistered: z.boolean(),
  vatRate: z.number().finite().min(0).max(1),

  minimumCharge: money,
});

/**
 * Fills any gap from the defaults.
 *
 * A rate card stored by an earlier version will be missing whatever has been
 * added since, and a missing crew rate silently reads as £0 an hour — a quote
 * that looks complete and charges nothing for labour. Filling from the
 * defaults keeps that visible as a wrong-looking number rather than an absent
 * one.
 */
export function parseRateCard(value: unknown): RateCard {
  const merged = { ...DEFAULT_RATE_CARD, ...(typeof value === "object" && value ? value : {}) };
  const result = rateCardSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_RATE_CARD;
}
