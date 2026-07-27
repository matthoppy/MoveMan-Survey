import { matchCatalog } from "../catalog";
import { newId } from "../ids";
import type { InventoryItem, RoomSurvey } from "../types";
import type { RawAnalysis, RawAnalysisItem } from "./schema";

/** Fallback volume when the model gave us neither a match nor an estimate. */
const UNKNOWN_ITEM_CUFT = 8;

export function normaliseItem(raw: RawAnalysisItem): InventoryItem {
  const entry = matchCatalog(raw.name, raw.room);

  const volumeCuFt = entry
    ? entry.cuFt
    : Number.isFinite(raw.estimatedCuFt) && (raw.estimatedCuFt ?? 0) > 0
      ? raw.estimatedCuFt!
      : UNKNOWN_ITEM_CUFT;

  return {
    id: newId(),
    room: raw.room?.trim() || "Unspecified",
    // Prefer the catalogue's wording so the inventory reads consistently,
    // but keep the client's phrasing in the notes when it differs.
    name: entry ? entry.name : raw.name.trim(),
    catalogId: entry?.id ?? null,
    quantity: Math.max(1, Math.round(raw.quantity || 1)),
    volumeCuFt,
    // The catalogue knows the default, the analyser knows this instance —
    // either saying "fragile" makes it fragile.
    fragile: raw.fragile || (entry?.fragile ?? false),
    twoPersonLift: entry?.twoPersonLift ?? volumeCuFt >= 30,
    dismantle: raw.dismantle || (entry?.dismantle ?? false),
    packing: entry?.packing ?? "wrap",
    notes: buildNotes(raw, entry?.name),
    source: "ai",
    confidence: clamp01(raw.confidence),
    timestampSec: Number.isFinite(raw.timestampSec) ? raw.timestampSec : undefined,
  };
}

function buildNotes(raw: RawAnalysisItem, canonicalName?: string): string | undefined {
  const parts: string[] = [];
  if (raw.notes?.trim()) parts.push(raw.notes.trim());
  if (canonicalName && canonicalName.toLowerCase() !== raw.name.trim().toLowerCase()) {
    parts.push(`Described as "${raw.name.trim()}"`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export interface NormalisedAnalysis {
  items: InventoryItem[];
  rooms: RoomSurvey[];
  summary: string;
  flags: string[];
}

export function normaliseAnalysis(raw: RawAnalysis): NormalisedAnalysis {
  const items = (raw.items ?? []).map(normaliseItem);

  const rooms: RoomSurvey[] = (raw.rooms ?? []).map((r) => ({
    name: r.name?.trim() || "Unspecified",
    packingLevel: r.packingLevel ?? "none",
    notes: r.notes?.trim() || undefined,
  }));

  // Any room an item was filed under but that never made the room list still
  // needs an entry, or its packing level silently defaults to nothing.
  const known = new Set(rooms.map((r) => r.name));
  for (const item of items) {
    if (!known.has(item.room)) {
      rooms.push({ name: item.room, packingLevel: "none" });
      known.add(item.room);
    }
  }

  const flags = [...(raw.flags ?? [])];
  if (raw.accessObservations?.notes?.trim()) {
    flags.push(`Access noted from video: ${raw.accessObservations.notes.trim()}`);
  }

  return { items, rooms, summary: raw.summary ?? "", flags };
}
