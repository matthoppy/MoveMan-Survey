"use client";

import type { JourneyDetails } from "@/lib/types";

export function JourneyFields({
  value,
  onChange,
}: {
  value: JourneyDetails;
  onChange: (next: JourneyDetails) => void;
}) {
  const set = <K extends keyof JourneyDetails>(key: K, next: JourneyDetails[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="grid-3">
      <div className="field">
        <label className="label" htmlFor="journey-distance">
          Move distance (miles)
        </label>
        <input
          id="journey-distance"
          className="input"
          type="number"
          min={0}
          max={2000}
          value={value.distanceMiles}
          onChange={(e) => set("distanceMiles", clamp(Number(e.target.value), 0, 2000))}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="journey-depot">
          Depot to collection (miles)
        </label>
        <input
          id="journey-depot"
          className="input"
          type="number"
          min={0}
          max={2000}
          value={value.depotToOriginMiles}
          onChange={(e) => set("depotToOriginMiles", clamp(Number(e.target.value), 0, 2000))}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="journey-road">
          Roads
        </label>
        <select
          id="journey-road"
          className="select"
          value={value.roadType}
          onChange={(e) => set("roadType", e.target.value as JourneyDetails["roadType"])}
        >
          <option value="urban">Mostly urban (22 mph)</option>
          <option value="mixed">Mixed (32 mph)</option>
          <option value="motorway">Mostly motorway (48 mph)</option>
        </select>
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
