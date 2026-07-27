import { z } from "zod";
import type { FloorLevel } from "./types";

export const accessSchema = z.object({
  floor: z
    .number()
    .int()
    .min(0)
    .max(4)
    .transform((n) => n as FloorLevel),
  liftAvailable: z.boolean(),
  carryDistanceM: z.number().min(0).max(500),
  parkingRestricted: z.boolean(),
  hoistRequired: z.boolean(),
  awkwardStairs: z.boolean(),
  notes: z.string().optional(),
});

export const journeySchema = z.object({
  distanceMiles: z.number().min(0).max(2000),
  roadType: z.enum(["urban", "mixed", "motorway"]),
  depotToOriginMiles: z.number().min(0).max(2000),
});

export const roomSchema = z.object({
  name: z.string().min(1),
  packingLevel: z.enum(["none", "part", "full"]),
  notes: z.string().optional(),
});

export const itemSchema = z.object({
  id: z.string().min(1),
  room: z.string().min(1),
  name: z.string().min(1),
  catalogId: z.string().nullable(),
  quantity: z.number().int().min(1).max(999),
  volumeCuFt: z.number().min(0).max(500),
  fragile: z.boolean(),
  twoPersonLift: z.boolean(),
  dismantle: z.boolean(),
  packing: z.enum(["none", "wrap", "carton", "wardrobe", "specialist"]),
  notes: z.string().optional(),
  source: z.enum(["ai", "manual"]),
  confidence: z.number().min(0).max(1).optional(),
  timestampSec: z.number().min(0).optional(),
});

export const surveyPatchSchema = z.object({
  clientName: z.string().min(1).optional(),
  clientEmail: z.string().optional(),
  clientPhone: z.string().optional(),
  originAddress: z.string().optional(),
  destinationAddress: z.string().optional(),
  moveDate: z.string().nullable().optional(),
  status: z
    .enum(["awaiting_video", "video_received", "analysing", "analysed", "quoted", "failed"])
    .optional(),
  origin: accessSchema.optional(),
  destination: accessSchema.optional(),
  journey: journeySchema.optional(),
  packingDayBefore: z.boolean().optional(),
  rooms: z.array(roomSchema).optional(),
  items: z.array(itemSchema).optional(),
  transcript: z.string().optional(),
});
