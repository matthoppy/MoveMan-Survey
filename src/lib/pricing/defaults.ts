import type { RateCard } from "./types";

/**
 * A rate card to start from, not one to quote from.
 *
 * These are plausible UK figures for 2026 so the quote page has something to
 * show on day one and the arithmetic can be checked. They are not anyone's
 * actual rates, and the settings page says so — a company that quotes from
 * these is quoting someone else's margin.
 */
export const DEFAULT_RATE_CARD: RateCard = {
  currency: "GBP",

  crewHourlyRate: 38,
  // Half a day. Below this the van, the fuel and the day are spent anyway.
  minimumChargeableHours: 4,

  vehicleDayRate: {
    "Luton box van": 120,
    "7.5t box van": 190,
    "18t removal lorry": 320,
  },
  mileageRate: 1.4,

  materialPrices: {
    "CTN-LG": 3.6,
    "CTN-MD": 2.5,
    "CTN-BK": 1.9,
    "CTN-WD": 9.5,
    "BOX-TV": 22,
    "BOX-PIC": 14,
    "BOX-IT": 6.5,
    "BOX-LAMP": 5.5,
    "BUB-750": 28,
    "PAP-10": 18,
    "TAPE-50": 2.2,
    MRK: 1.2,
    LBL: 3,
    "COV-MAT-S": 4.5,
    "COV-MAT-D": 5.5,
    "COV-SOFA": 6,
    "COV-CHAIR": 4,
    "COV-APP": 4,
    BLK: 0,
    "STR-WRAP": 12,
    "FLR-PROT": 22,
    "DOOR-PROT": 0,
    "BAG-FIX": 0.4,
  },
  materialsMarkup: 0.25,

  adjustment: 0,
  adjustmentReason: "",

  vatRegistered: true,
  vatRate: 0.2,

  minimumCharge: 350,
};

/**
 * Items the crew brings and takes away again. Priced at zero on purpose:
 * blankets and door protectors are not sold to the customer, and quoting them
 * as a line at £0 is more honest than leaving them off a picking list the
 * warehouse works from.
 */
export const REUSABLE_SKUS = ["BLK", "DOOR-PROT"];
