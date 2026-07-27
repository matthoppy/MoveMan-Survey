/**
 * Domain types for a removals survey.
 *
 * Volumes are held in cubic feet throughout — the working unit in the UK
 * removals trade. `CUFT_PER_CUBIC_METRE` converts for display only.
 */

export const CUFT_PER_CUBIC_METRE = 35.3147;

/** How an item has to be handled before it goes on the van. */
export type PackingClass =
  /** Goes straight on the van, blanket-wrapped at most. */
  | "none"
  /** Needs wrapping — bubble wrap / blankets / stretch wrap. */
  | "wrap"
  /** Contents go into cartons (crockery, books, cupboard contents). */
  | "carton"
  /** Hanging garments — wardrobe cartons. */
  | "wardrobe"
  /** Piano, safe, artwork, aquarium: needs specialist handling or a subcontractor. */
  | "specialist";

/** How much of a room the crew is packing, as opposed to the customer. */
export type PackingLevel = "none" | "part" | "full";

export type ItemSource = "ai" | "manual";

export interface InventoryItem {
  id: string;
  /** Room label as narrated, e.g. "Master bedroom". */
  room: string;
  /** Display name, e.g. "3-seater sofa". */
  name: string;
  /** Matched catalogue key, or null when the item was not recognised. */
  catalogId: string | null;
  quantity: number;
  /** Volume per single unit, cubic feet. */
  volumeCuFt: number;
  fragile: boolean;
  /** Needs two or more people to shift safely. */
  twoPersonLift: boolean;
  /** Must come apart before it will move. */
  dismantle: boolean;
  packing: PackingClass;
  notes?: string;
  source: ItemSource;
  /** 0-1, only meaningful for AI-derived items. */
  confidence?: number;
  /** Seconds into the video where this item was identified. */
  timestampSec?: number;
}

export interface RoomSurvey {
  name: string;
  packingLevel: PackingLevel;
  notes?: string;
}

/** Vertical access at one end of the move. */
export type FloorLevel = 0 | 1 | 2 | 3 | 4;

export interface AccessDetails {
  /** 0 = ground floor. */
  floor: FloorLevel;
  liftAvailable: boolean;
  /** Metres from the parking space to the front door. */
  carryDistanceM: number;
  /** No dropped kerb, permit zone, red route, tight street. */
  parkingRestricted: boolean;
  /** Doorways/stairwells too tight — items go out through a window or need a hoist. */
  hoistRequired: boolean;
  /** Narrow stairs, tight turns, low ceilings. */
  awkwardStairs: boolean;
  notes?: string;
}

export interface JourneyDetails {
  distanceMiles: number;
  /** Drives the assumed average speed. */
  roadType: "urban" | "mixed" | "motorway";
  /** Round trip from the depot to origin and back after unloading. */
  depotToOriginMiles: number;
}

export interface SurveyInput {
  items: InventoryItem[];
  rooms: RoomSurvey[];
  origin: AccessDetails;
  destination: AccessDetails;
  journey: JourneyDetails;
  /** Crew packs on a separate day before the move. */
  packingDayBefore: boolean;
}

export interface MaterialLine {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  /** Why the estimator asked for this many. */
  basis: string;
}

export interface VolumeBreakdown {
  /** Volume of the furniture and appliances themselves. */
  furnitureCuFt: number;
  /** Volume the packed cartons will occupy. */
  cartonCuFt: number;
  totalCuFt: number;
  totalCubicMetres: number;
  byRoom: Array<{ room: string; cuFt: number }>;
}

export interface LabourBreakdown {
  packingHours: number;
  dismantleHours: number;
  loadHours: number;
  unloadHours: number;
  reassembleHours: number;
  drivingHours: number;
  totalManHours: number;
  /** Productivity multipliers actually applied, for showing the working. */
  originAccessFactor: number;
  destinationAccessFactor: number;
}

export interface VehiclePlan {
  type: string;
  capacityCuFt: number;
  count: number;
}

export interface CrewPlan {
  crewSize: number;
  /** Days on site, excluding a separate packing day. */
  moveDays: number;
  packingDays: number;
  vehicles: VehiclePlan[];
  /** Human-readable reasons the crew or vehicle count was pushed up. */
  drivers: string[];
  warnings: string[];
}

export interface SurveyEstimate {
  volume: VolumeBreakdown;
  materials: MaterialLine[];
  labour: LabourBreakdown;
  crew: CrewPlan;
}

export type SurveyStatus =
  | "awaiting_video"
  | "video_received"
  | "analysing"
  | "analysed"
  | "quoted"
  | "failed";

export type CaptureMode = "upload" | "recorded" | "live";

export interface SurveyRecord {
  id: string;
  reference: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  originAddress: string;
  destinationAddress: string;
  moveDate: string | null;
  status: SurveyStatus;
  /** Token for the public capture link handed to the client. */
  captureToken: string;
  origin: AccessDetails;
  destination: AccessDetails;
  journey: JourneyDetails;
  packingDayBefore: boolean;
  rooms: RoomSurvey[];
  items: InventoryItem[];
  transcript: string;
  /** Free-text summary the analyser wrote about the property. */
  analysisSummary: string;
  /** Anything the analyser could not resolve and a human should check. */
  analysisFlags: string[];
  analysisModel: string | null;
  analysedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoRecord {
  id: string;
  surveyId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  mode: CaptureMode;
  /** Set while a live capture is still streaming in. */
  complete: boolean;
  createdAt: string;
}

export const DEFAULT_ACCESS: AccessDetails = {
  floor: 0,
  liftAvailable: false,
  carryDistanceM: 10,
  parkingRestricted: false,
  hoistRequired: false,
  awkwardStairs: false,
};

export const DEFAULT_JOURNEY: JourneyDetails = {
  distanceMiles: 15,
  roadType: "mixed",
  depotToOriginMiles: 10,
};
