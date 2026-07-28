/**
 * Turning an estimate into money.
 *
 * Everything up to here is physics and trade practice — cubic feet, man-hours,
 * how many people fit on a staircase. None of that varies between removals
 * companies. What it costs does, enormously, so it lives apart: one rate card
 * per company, applied to an estimate nobody has had to change.
 *
 * The separation is also what makes the numbers arguable. A quote that comes
 * out too high is either a wrong volume or a wrong rate, and a surveyor can
 * tell which by looking at the two halves.
 */

export interface RateCard {
  /** ISO 4217, for formatting. Nothing converts between currencies. */
  currency: string;

  /** Charged per crew member per hour on site. */
  crewHourlyRate: number;
  /**
   * Hours below which the day is charged anyway.
   *
   * Nobody sends a crew out for ninety minutes and charges for ninety minutes
   * — the van, the fuel and the day are gone either way.
   */
  minimumChargeableHours: number;

  /** Per vehicle per day, covering the vehicle itself rather than the driver. */
  vehicleDayRate: Record<string, number>;
  /** Fuel and wear, per mile, per vehicle. */
  mileageRate: number;

  /** Unit price per materials SKU. A SKU with no price is quoted at zero and flagged. */
  materialPrices: Record<string, number>;
  /**
   * Materials marked up on top of cost. 0.25 = quoted at cost plus 25%.
   */
  materialsMarkup: number;

  /** Applied to the whole job before VAT. 0.1 = 10% on top; -0.05 = 5% discount. */
  adjustment: number;
  adjustmentReason: string;

  vatRegistered: boolean;
  /** 0.2 for UK standard rate. Ignored when not VAT registered. */
  vatRate: number;

  /** Nothing is quoted below this, before VAT. */
  minimumCharge: number;
}

export interface QuoteLine {
  /** Grouping for the printed quote. */
  section: "labour" | "vehicles" | "travel" | "materials" | "adjustment";
  description: string;
  /** Null where the line is a single charge rather than a rate times a count. */
  quantity: number | null;
  unit: string;
  unitPrice: number;
  total: number;
  /** How the quantity was arrived at, so the customer can be answered. */
  basis: string;
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  /** Before adjustment and VAT. */
  net: number;
  adjustment: number;
  /** After adjustment, before VAT. */
  subtotal: number;
  vat: number;
  total: number;
  /** Raised where the price needs a human before it goes out. */
  warnings: string[];
  /** True when the minimum charge, not the work, set the price. */
  minimumApplied: boolean;
}
