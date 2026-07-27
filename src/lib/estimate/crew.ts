import type {
  AccessDetails,
  CrewPlan,
  InventoryItem,
  JourneyDetails,
  LabourBreakdown,
  RoomSurvey,
  VehiclePlan,
} from "../types";
import { cartonPlan } from "./cartons";
import { round } from "./volume";

/**
 * Cubic feet one person loads onto the van per hour with clear ground-floor
 * access. Benchmarked against a three-bed house: ~1,200 cu ft loaded by three
 * crew in a little over four hours.
 */
const LOAD_RATE_CUFT_PER_MAN_HOUR = 80;

/**
 * Cubic feet of goods needed to keep one more crew member usefully busy.
 *
 * Past this density people queue on the stairs and in the van, so throwing
 * bodies at a small job stops buying time. It caps what the hours arithmetic
 * can ask for — it does not override a crew size the work genuinely requires,
 * such as a two-person lift or a hoist.
 */
const CUFT_PER_USEFUL_CREW = 120;
/** Unloading runs faster than loading — no decision-making about what goes where. */
const UNLOAD_SPEEDUP = 1.2;

/** Hours to pack one carton, by type. */
const PACK_HOURS_PER_CARTON = { large: 0.2, medium: 0.25, book: 0.2, wardrobe: 0.15 };

const DISMANTLE_HOURS_PER_UNIT = 0.4;
const REASSEMBLE_HOURS_PER_UNIT = 0.5;

/** Target productive hours on site per crew member per day. */
const TARGET_DAY_HOURS = 8.5;
/** Hard ceiling before the job has to run over two days. */
const MAX_DAY_HOURS = 10;

const AVG_SPEED_MPH = { urban: 22, mixed: 32, motorway: 48 };

/** UK drivers' hours: 9 hours' driving in a day, extendable to 10 twice a week. */
const MAX_DRIVING_HOURS_PER_DAY = 9;

export const VEHICLES = [
  { type: "Luton box van", capacityCuFt: 600 },
  { type: "7.5t box van", capacityCuFt: 1100 },
  { type: "18t removal lorry", capacityCuFt: 2000 },
] as const;

/**
 * Productivity multiplier for one end of the move.
 *
 * 1.0 is a ground-floor property you can park directly outside. Everything
 * else makes the crew slower, and the factors compound.
 */
export function accessFactor(access: AccessDetails): number {
  let factor: number;

  if (access.floor === 0) {
    factor = 1;
  } else if (access.liftAvailable) {
    // A lift caps the penalty — it's the waiting, not the climbing.
    factor = [1, 0.92, 0.9, 0.88, 0.86][access.floor];
  } else {
    factor = [1, 0.8, 0.68, 0.58, 0.48][access.floor];
  }

  // Long carry from the van: no penalty for the first 15m, then it bites.
  const extraCarry = Math.max(0, access.carryDistanceM - 15);
  factor *= Math.max(0.6, 1 - Math.ceil(extraCarry / 15) * 0.06);

  if (access.parkingRestricted) factor *= 0.92;
  if (access.awkwardStairs) factor *= 0.88;
  if (access.hoistRequired) factor *= 0.75;

  return round(Math.min(1, Math.max(0.3, factor)), 3);
}

export interface LabourInput {
  items: InventoryItem[];
  rooms: RoomSurvey[];
  volumeCuFt: number;
  origin: AccessDetails;
  destination: AccessDetails;
  journey: JourneyDetails;
}

export function computeLabour(input: LabourInput): LabourBreakdown {
  const { items, rooms, volumeCuFt, origin, destination, journey } = input;

  const plan = cartonPlan(items, rooms);
  const originAccessFactor = accessFactor(origin);
  const destinationAccessFactor = accessFactor(destination);

  let packingHours =
    plan.large * PACK_HOURS_PER_CARTON.large +
    plan.medium * PACK_HOURS_PER_CARTON.medium +
    plan.book * PACK_HOURS_PER_CARTON.book +
    plan.wardrobe * PACK_HOURS_PER_CARTON.wardrobe;

  // Fragile-heavy contents slow the packers down; scale by how much of the
  // inventory by volume is flagged fragile.
  const totalItemCuFt = items.reduce((s, i) => s + i.volumeCuFt * i.quantity, 0);
  const fragileCuFt = items.filter((i) => i.fragile).reduce((s, i) => s + i.volumeCuFt * i.quantity, 0);
  const fragileShare = totalItemCuFt > 0 ? fragileCuFt / totalItemCuFt : 0;
  packingHours *= 1 + fragileShare * 0.35;

  const dismantleUnits = items.filter((i) => i.dismantle).reduce((n, i) => n + i.quantity, 0);
  const dismantleHours = dismantleUnits * DISMANTLE_HOURS_PER_UNIT;
  const reassembleHours = dismantleUnits * REASSEMBLE_HOURS_PER_UNIT;

  const loadHours = volumeCuFt / (LOAD_RATE_CUFT_PER_MAN_HOUR * originAccessFactor);
  const unloadHours = volumeCuFt / (LOAD_RATE_CUFT_PER_MAN_HOUR * UNLOAD_SPEEDUP * destinationAccessFactor);

  const drivingHours = computeDrivingHours(journey);

  return {
    packingHours: round(packingHours),
    dismantleHours: round(dismantleHours),
    loadHours: round(loadHours),
    unloadHours: round(unloadHours),
    reassembleHours: round(reassembleHours),
    drivingHours: round(drivingHours),
    // Driving is wall-clock for the whole crew, so it is added per person.
    totalManHours: round(packingHours + dismantleHours + loadHours + unloadHours + reassembleHours),
    originAccessFactor,
    destinationAccessFactor,
  };
}

/**
 * Wall-clock driving for the day: depot to the origin, the loaded leg, then
 * back to the depot. The return leg is bounded above by depot-to-origin plus
 * the loaded leg, which is what we assume when we don't know the depot's
 * position relative to the destination.
 */
export function computeDrivingHours(journey: JourneyDetails): number {
  const speed = AVG_SPEED_MPH[journey.roadType];
  const miles = journey.depotToOriginMiles + journey.distanceMiles + (journey.depotToOriginMiles + journey.distanceMiles);
  return miles / speed;
}

export interface CrewInput extends LabourInput {
  labour: LabourBreakdown;
  packingDayBefore: boolean;
}

export function computeCrew(input: CrewInput): CrewPlan {
  const { items, volumeCuFt, labour, journey, origin, destination, packingDayBefore } = input;

  const drivers: string[] = [];
  const warnings: string[] = [];

  // Hours that have to happen on moving day. If the crew packs the day
  // before, packing comes out of the moving-day total.
  const moveDayManHours = packingDayBefore
    ? labour.totalManHours - labour.packingHours
    : labour.totalManHours;

  let crewSize = 2;
  for (let size = 2; size <= 8; size++) {
    const dayHours = moveDayManHours / size + labour.drivingHours;
    crewSize = size;
    if (dayHours <= TARGET_DAY_HOURS) break;
  }

  const usefulCap = Math.max(2, Math.ceil(volumeCuFt / CUFT_PER_USEFUL_CREW));
  if (crewSize > usefulCap) {
    crewSize = usefulCap;
    drivers.push(
      `Held at ${crewSize} crew — at ${Math.round(volumeCuFt)} cu ft there isn't enough work to keep more people moving`,
    );
  } else if (crewSize > 2) {
    drivers.push(
      `${round(moveDayManHours)} man-hours of work on moving day — ${crewSize} crew keeps it inside a working day`,
    );
  }

  // Floors under the crew size that don't come from the arithmetic.
  const applyFloor = (min: number, reason: string) => {
    if (min > crewSize) {
      crewSize = min;
      drivers.push(reason);
    }
  };

  if (volumeCuFt >= 1000) applyFloor(3, `${Math.round(volumeCuFt)} cu ft of goods needs at least 3 crew`);
  if (volumeCuFt >= 1600) applyFloor(4, `${Math.round(volumeCuFt)} cu ft of goods needs at least 4 crew`);
  if (volumeCuFt >= 2400) applyFloor(5, `${Math.round(volumeCuFt)} cu ft of goods needs at least 5 crew`);

  const heavyItems = items.filter((i) => i.twoPersonLift).reduce((n, i) => n + i.quantity, 0);
  if (heavyItems > 0) applyFloor(2, `${heavyItems} item(s) need a two-person lift`);

  if (origin.hoistRequired || destination.hoistRequired) {
    applyFloor(crewSize + 1, "hoist / window access needs an extra pair of hands on the ground");
  }

  const stairsNoLift =
    (origin.floor >= 2 && !origin.liftAvailable) || (destination.floor >= 2 && !destination.liftAvailable);
  if (stairsNoLift) {
    applyFloor(3, "second floor or above with no lift — a stair relay is faster than carrying through");
  }

  const specialist = items.filter((i) => i.packing === "specialist");
  if (specialist.length > 0) {
    warnings.push(
      `Specialist handling required for: ${specialist.map((i) => i.name).join(", ")}. Price a subcontractor or confirm in-house capability.`,
    );
  }

  // Days on site.
  const moveDayHours = moveDayManHours / crewSize + labour.drivingHours;
  let moveDays = Math.max(1, Math.ceil(moveDayHours / MAX_DAY_HOURS));
  const packingDays = packingDayBefore && labour.packingHours > 0
    ? Math.max(1, Math.ceil(labour.packingHours / crewSize / TARGET_DAY_HOURS))
    : 0;

  if (moveDays > 1) {
    warnings.push(
      `Estimated ${round(moveDayHours)} hours on moving day with ${crewSize} crew — exceeds a single working day, so it is planned over ${moveDays} days.`,
    );
  }

  const oneWayDriving = journey.distanceMiles / AVG_SPEED_MPH[journey.roadType];
  if (labour.drivingHours > MAX_DRIVING_HOURS_PER_DAY) {
    warnings.push(
      `Driving alone is ${round(labour.drivingHours)} hours, over the ${MAX_DRIVING_HOURS_PER_DAY}-hour daily limit. Plan a second driver or an overnight.`,
    );
    moveDays = Math.max(moveDays, 2);
  } else if (oneWayDriving > 4) {
    warnings.push(`Long-distance move — ${round(oneWayDriving)} hours each way. Confirm overnight or early start with the customer.`);
  }

  const vehicles = planVehicles(volumeCuFt);
  if (vehicles.length === 0) {
    warnings.push("No vehicle assigned — inventory is empty.");
  }

  const totalCapacity = vehicles.reduce((c, v) => c + v.capacityCuFt * v.count, 0);
  if (totalCapacity > 0 && volumeCuFt / totalCapacity > 0.95) {
    warnings.push("Load is within 5% of van capacity — no room for error if the survey under-reads. Consider the next size up.");
  }

  // A crew has to be able to drive what it's been given.
  const vehicleCount = vehicles.reduce((n, v) => n + v.count, 0);
  if (vehicleCount > crewSize) {
    applyFloor(vehicleCount, `${vehicleCount} vehicles need ${vehicleCount} drivers`);
  }

  return { crewSize, moveDays, packingDays, vehicles, drivers, warnings };
}

/**
 * Pick the vehicle set that takes the whole load in one trip.
 *
 * Fewest vehicles wins, because every extra vehicle is another driver; ties
 * are broken on least wasted capacity, so 900 cu ft gets one 7.5-tonner
 * rather than two Lutons. The search space is three vehicle types with small
 * counts, so an exhaustive sweep is both exact and instant — a greedy
 * largest-first fill gets this wrong.
 */
export function planVehicles(volumeCuFt: number): VehiclePlan[] {
  if (volumeCuFt <= 0) return [];

  const types = [...VEHICLES].sort((a, b) => b.capacityCuFt - a.capacityCuFt);
  const maxOfLargest = Math.ceil(volumeCuFt / types[0].capacityCuFt) + 1;

  let best: { counts: number[]; total: number; capacity: number } | null = null;

  for (let a = 0; a <= maxOfLargest; a++) {
    for (let b = 0; b <= 3; b++) {
      for (let c = 0; c <= 3; c++) {
        const total = a + b + c;
        if (total === 0) continue;

        const capacity =
          a * types[0].capacityCuFt + b * types[1].capacityCuFt + c * types[2].capacityCuFt;
        if (capacity < volumeCuFt) continue;

        if (!best || total < best.total || (total === best.total && capacity < best.capacity)) {
          best = { counts: [a, b, c], total, capacity };
        }
      }
    }
  }

  if (!best) {
    // Beyond anything the sweep covers — fall back to filling with the largest.
    const count = Math.ceil(volumeCuFt / types[0].capacityCuFt);
    return [{ type: types[0].type, capacityCuFt: types[0].capacityCuFt, count }];
  }

  return types
    .map((vehicle, index) => ({
      type: vehicle.type,
      capacityCuFt: vehicle.capacityCuFt,
      count: best!.counts[index],
    }))
    .filter((plan) => plan.count > 0);
}

export { TARGET_DAY_HOURS, MAX_DAY_HOURS, AVG_SPEED_MPH, LOAD_RATE_CUFT_PER_MAN_HOUR };
