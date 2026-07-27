"use client";

import type { AccessDetails, FloorLevel } from "@/lib/types";

const FLOORS: Array<{ value: FloorLevel; label: string }> = [
  { value: 0, label: "Ground floor" },
  { value: 1, label: "1st floor" },
  { value: 2, label: "2nd floor" },
  { value: 3, label: "3rd floor" },
  { value: 4, label: "4th floor or higher" },
];

export function AccessFields({
  value,
  onChange,
  idPrefix,
}: {
  value: AccessDetails;
  onChange: (next: AccessDetails) => void;
  idPrefix: string;
}) {
  const set = <K extends keyof AccessDetails>(key: K, next: AccessDetails[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="stack-sm">
      <div className="grid-2">
        <div className="field">
          <label className="label" htmlFor={`${idPrefix}-floor`}>
            Floor
          </label>
          <select
            id={`${idPrefix}-floor`}
            className="select"
            value={value.floor}
            onChange={(e) => set("floor", Number(e.target.value) as FloorLevel)}
          >
            {FLOORS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor={`${idPrefix}-carry`}>
            Carry from parking (metres)
          </label>
          <input
            id={`${idPrefix}-carry`}
            className="input"
            type="number"
            min={0}
            max={500}
            value={value.carryDistanceM}
            onChange={(e) => set("carryDistanceM", clamp(Number(e.target.value), 0, 500))}
          />
        </div>
      </div>

      <div className="stack-sm" style={{ marginTop: "0.25rem" }}>
        <label className="check">
          <input
            type="checkbox"
            checked={value.liftAvailable}
            disabled={value.floor === 0}
            onChange={(e) => set("liftAvailable", e.target.checked)}
          />
          Lift available
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={value.awkwardStairs}
            onChange={(e) => set("awkwardStairs", e.target.checked)}
          />
          Narrow or winding stairs
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={value.parkingRestricted}
            onChange={(e) => set("parkingRestricted", e.target.checked)}
          />
          Restricted parking (permit, red route, narrow street)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={value.hoistRequired}
            onChange={(e) => set("hoistRequired", e.target.checked)}
          />
          Hoist or window access needed
        </label>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-notes`}>
          Access notes
        </label>
        <input
          id={`${idPrefix}-notes`}
          className="input input-sm"
          value={value.notes ?? ""}
          placeholder="Gate code, loading bay times, neighbour's driveway…"
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
