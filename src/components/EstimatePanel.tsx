"use client";

import { formatCuFt, formatHours } from "@/lib/format";
import type { SurveyEstimate } from "@/lib/types";

export function EstimatePanel({ estimate }: { estimate: SurveyEstimate }) {
  const { volume, crew, labour, materials } = estimate;
  const hasInventory = volume.totalCuFt > 0;

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>The job</h2>
        </div>
        <div className="card-body stack">
          <div className="grid-3">
            <div className="stat">
              <div className="stat-label">Volume</div>
              <div className="stat-value">{Math.round(volume.totalCuFt).toLocaleString("en-GB")}</div>
              <div className="stat-sub">cu ft · {volume.totalCubicMetres} m³</div>
            </div>
            <div className="stat">
              <div className="stat-label">Crew</div>
              <div className="stat-value">{hasInventory ? crew.crewSize : "—"}</div>
              <div className="stat-sub">
                {crew.moveDays > 1 ? `over ${crew.moveDays} days` : "on moving day"}
                {crew.packingDays > 0 && ` + ${crew.packingDays} packing day${crew.packingDays > 1 ? "s" : ""}`}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Labour</div>
              <div className="stat-value">{Math.round(labour.totalManHours)}</div>
              <div className="stat-sub">man-hours on site</div>
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: "0.35rem" }}>
              Vehicles
            </div>
            {crew.vehicles.length === 0 ? (
              <p className="small faint">Nothing to load yet.</p>
            ) : (
              <ul className="stack-sm small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {crew.vehicles.map((vehicle) => (
                  <li key={vehicle.type}>
                    {vehicle.count} × {vehicle.type}{" "}
                    <span className="faint">({formatCuFt(vehicle.capacityCuFt)} each)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {crew.drivers.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: "0.35rem" }}>
                Why this crew size
              </div>
              <ul className="stack-sm small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {crew.drivers.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ul>
            </div>
          )}

          {crew.warnings.length > 0 && (
            <div className="notice notice-warning">
              <strong>Check before quoting</strong>
              <ul>
                {crew.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Time breakdown</h2>
          <span className="tiny faint">
            access {Math.round(labour.originAccessFactor * 100)}% out ·{" "}
            {Math.round(labour.destinationAccessFactor * 100)}% in
          </span>
        </div>
        <div className="card-body-flush">
          <table className="table">
            <tbody>
              <TimeRow label="Packing" hours={labour.packingHours} />
              <TimeRow label="Dismantling" hours={labour.dismantleHours} />
              <TimeRow label="Loading" hours={labour.loadHours} />
              <TimeRow label="Unloading" hours={labour.unloadHours} />
              <TimeRow label="Reassembly" hours={labour.reassembleHours} />
              <tr>
                <td>
                  <strong>Total on site</strong>
                </td>
                <td className="num">
                  <strong>{formatHours(labour.totalManHours)}</strong>
                </td>
              </tr>
              <tr>
                <td>
                  Driving <span className="tiny faint">(whole crew, depot to depot)</span>
                </td>
                <td className="num">{formatHours(labour.drivingHours)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Materials</h2>
          <span className="tiny faint">{materials.length} lines</span>
        </div>
        {materials.length === 0 ? (
          <div className="empty small">Nothing needed — no packing service and no inventory.</div>
        ) : (
          <div className="card-body-flush">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num" style={{ width: "5rem" }}>
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {materials.map((line) => (
                  <tr key={line.sku}>
                    <td>
                      <div>{line.name}</div>
                      <div className="tiny faint">{line.basis}</div>
                    </td>
                    <td className="num nowrap">
                      {line.quantity} <span className="tiny faint">{line.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {volume.byRoom.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Volume by room</h2>
            <span className="tiny faint">
              {formatCuFt(volume.furnitureCuFt)} furniture + {formatCuFt(volume.cartonCuFt)} cartons
            </span>
          </div>
          <div className="card-body-flush">
            <table className="table">
              <tbody>
                {volume.byRoom.map((row) => (
                  <tr key={row.room}>
                    <td>{row.room}</td>
                    <td className="num">{formatCuFt(row.cuFt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function TimeRow({ label, hours }: { label: string; hours: number }) {
  if (hours <= 0) return null;
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{formatHours(hours)}</td>
    </tr>
  );
}
