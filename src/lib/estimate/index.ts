import type { SurveyEstimate, SurveyInput } from "../types";
import { computeCrew, computeLabour } from "./crew";
import { computeMaterials } from "./materials";
import { computeVolume } from "./volume";

/**
 * The whole estimate, from inventory to crew.
 *
 * Pure and synchronous: given the same survey it always produces the same
 * numbers, so a surveyor can edit an item and watch the quote move.
 */
export function estimateSurvey(input: SurveyInput): SurveyEstimate {
  const volume = computeVolume(input.items, input.rooms);
  const materials = computeMaterials(input.items, input.rooms);

  const labourInput = {
    items: input.items,
    rooms: input.rooms,
    volumeCuFt: volume.totalCuFt,
    origin: input.origin,
    destination: input.destination,
    journey: input.journey,
  };

  const labour = computeLabour(labourInput);
  const crew = computeCrew({ ...labourInput, labour, packingDayBefore: input.packingDayBefore });

  return { volume, materials, labour, crew };
}

export { computeVolume } from "./volume";
export { computeMaterials } from "./materials";
export { computeCrew, computeLabour, accessFactor, planVehicles, VEHICLES } from "./crew";
export { cartonPlan, totalCartons, roomProfileFor, CARTON_VOLUME_CUFT } from "./cartons";
