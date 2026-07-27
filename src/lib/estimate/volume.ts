import { CUFT_PER_CUBIC_METRE, type InventoryItem, type VolumeBreakdown } from "../types";
import { cartonPlan, CARTON_VOLUME_CUFT, type CartonPlan } from "./cartons";
import type { RoomSurvey } from "../types";

export function furnitureVolume(items: InventoryItem[]): number {
  return items.reduce((sum, item) => sum + item.volumeCuFt * item.quantity, 0);
}

export function cartonVolume(plan: CartonPlan): number {
  return (
    plan.large * CARTON_VOLUME_CUFT.large +
    plan.medium * CARTON_VOLUME_CUFT.medium +
    plan.book * CARTON_VOLUME_CUFT.book +
    plan.wardrobe * CARTON_VOLUME_CUFT.wardrobe
  );
}

export function computeVolume(items: InventoryItem[], rooms: RoomSurvey[]): VolumeBreakdown {
  const plan = cartonPlan(items, rooms);
  const furnitureCuFt = furnitureVolume(items);
  const cartonCuFt = cartonVolume(plan);
  const totalCuFt = furnitureCuFt + cartonCuFt;

  // Cartons are attributed back to the room that generated them so the
  // per-room figures add up to the total.
  const roomTotals = new Map<string, number>();
  for (const item of items) {
    const key = item.room || "Unspecified";
    roomTotals.set(key, (roomTotals.get(key) ?? 0) + item.volumeCuFt * item.quantity);
  }
  for (const [room, roomPlan] of plan.byRoom) {
    roomTotals.set(room, (roomTotals.get(room) ?? 0) + cartonVolume(roomPlan));
  }

  const byRoom = [...roomTotals.entries()]
    .map(([room, cuFt]) => ({ room, cuFt: round(cuFt) }))
    .sort((a, b) => b.cuFt - a.cuFt);

  return {
    furnitureCuFt: round(furnitureCuFt),
    cartonCuFt: round(cartonCuFt),
    totalCuFt: round(totalCuFt),
    totalCubicMetres: round(totalCuFt / CUFT_PER_CUBIC_METRE, 2),
    byRoom,
  };
}

export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
