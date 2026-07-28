"use client";

import { useState } from "react";
import { VEHICLES } from "@/lib/estimate/crew";
import type { RateCard } from "@/lib/pricing/types";

/** Every SKU the estimator can produce, so a price can be set before it is needed. */
const MATERIAL_LABELS: Record<string, string> = {
  "CTN-LG": "Large carton",
  "CTN-MD": "Medium (no.2) carton",
  "CTN-BK": "Book carton",
  "CTN-WD": "Wardrobe carton",
  "BOX-TV": "Flat-screen TV box",
  "BOX-PIC": "Picture / mirror box",
  "BOX-IT": "Computer carton",
  "BOX-LAMP": "Lamp carton",
  "BUB-750": "Bubble wrap (roll)",
  "PAP-10": "Packing paper (10kg)",
  "TAPE-50": "Packing tape (roll)",
  MRK: "Marker pen",
  LBL: "Room label sheet",
  "COV-MAT-S": "Mattress cover (single)",
  "COV-MAT-D": "Mattress cover (double)",
  "COV-SOFA": "Sofa cover",
  "COV-CHAIR": "Armchair cover",
  "COV-APP": "Appliance cover",
  BLK: "Furniture blanket (reusable)",
  "STR-WRAP": "Stretch wrap (roll)",
  "FLR-PROT": "Floor protection (roll)",
  "DOOR-PROT": "Door / bannister protector (reusable)",
  "BAG-FIX": "Fixings bag",
};

export function RateCardForm({
  initial,
  configured,
}: {
  initial: RateCard;
  configured: boolean;
}) {
  const [card, setCard] = useState<RateCard>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof RateCard>(key: K, value: RateCard[K]) =>
    setCard((c) => ({ ...c, [key]: value }));

  async function save() {
    setState("saving");
    setError(null);

    try {
      const response = await fetch("/api/settings/rate-card", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the rates.");
      setState("saved");
      setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the rates.");
      setState("error");
    }
  }

  return (
    <div className="stack">
      {!configured && (
        <div className="notice notice-warning">
          <strong>These are example figures, not your rates.</strong> Every quote in the app is being
          worked out from them until you save your own. They are plausible for a UK removals firm and
          they are still somebody else&apos;s margin.
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Labour</h2>
        </div>
        <div className="card-body grid-2">
          <Field
            id="crew-rate"
            label={`Crew rate (${card.currency} per person per hour)`}
            value={card.crewHourlyRate}
            onChange={(v) => set("crewHourlyRate", v)}
          />
          <Field
            id="min-hours"
            label="Minimum hours charged per person"
            value={card.minimumChargeableHours}
            step={0.5}
            onChange={(v) => set("minimumChargeableHours", v)}
            hint="Nobody sends a crew out for ninety minutes and bills ninety minutes."
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Vehicles and travel</h2>
        </div>
        <div className="card-body grid-2">
          {VEHICLES.map((vehicle) => (
            <Field
              key={vehicle.type}
              id={`veh-${vehicle.type}`}
              label={`${vehicle.type} (per day)`}
              value={card.vehicleDayRate[vehicle.type] ?? 0}
              onChange={(v) =>
                set("vehicleDayRate", { ...card.vehicleDayRate, [vehicle.type]: v })
              }
              hint={`${vehicle.capacityCuFt} cu ft`}
            />
          ))}
          <Field
            id="mileage"
            label="Mileage (per mile, per vehicle)"
            value={card.mileageRate}
            step={0.05}
            onChange={(v) => set("mileageRate", v)}
            hint="Counts the loaded run plus the depot journey out and back."
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Materials</h2>
          <span className="tiny faint">what you pay — the markup is added on top</span>
        </div>
        <div className="card-body stack">
          <div className="grid-2">
            <Field
              id="markup"
              label="Markup (%)"
              value={Math.round(card.materialsMarkup * 1000) / 10}
              step={1}
              onChange={(v) => set("materialsMarkup", v / 100)}
            />
          </div>
          <div className="grid-3">
            {Object.keys(MATERIAL_LABELS).map((sku) => (
              <Field
                key={sku}
                id={`mat-${sku}`}
                label={MATERIAL_LABELS[sku]}
                value={card.materialPrices[sku] ?? 0}
                step={0.1}
                onChange={(v) => set("materialPrices", { ...card.materialPrices, [sku]: v })}
                hint={sku}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Job totals</h2>
        </div>
        <div className="card-body grid-2">
          <Field
            id="min-charge"
            label="Minimum charge (before VAT)"
            value={card.minimumCharge}
            onChange={(v) => set("minimumCharge", v)}
          />
          <Field
            id="adjustment"
            label="Standing adjustment (%)"
            value={Math.round(card.adjustment * 1000) / 10}
            step={1}
            onChange={(v) => set("adjustment", v / 100)}
            hint="Positive loads every quote, negative discounts it. Usually zero."
          />
          <div className="field">
            <label className="label" htmlFor="adjustment-reason">
              Adjustment shown as
            </label>
            <input
              id="adjustment-reason"
              className="input"
              value={card.adjustmentReason}
              placeholder="e.g. Peak season loading"
              onChange={(e) => set("adjustmentReason", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="vat-registered">
              VAT
            </label>
            <div className="row-tight">
              <label className="check">
                <input
                  id="vat-registered"
                  type="checkbox"
                  checked={card.vatRegistered}
                  onChange={(e) => set("vatRegistered", e.target.checked)}
                />
                <span>VAT registered</span>
              </label>
            </div>
            {card.vatRegistered && (
              <input
                className="input"
                type="number"
                step={1}
                value={Math.round(card.vatRate * 1000) / 10}
                onChange={(e) => set("vatRate", (Number(e.target.value) || 0) / 100)}
                style={{ marginTop: "0.4rem" }}
                aria-label="VAT rate percent"
              />
            )}
          </div>
        </div>
      </section>

      {error && <div className="notice notice-danger">{error}</div>}

      <div className="row-tight">
        <button className="btn btn-primary" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : "Save rates"}
        </button>
        <span className="tiny faint" aria-live="polite">
          {state === "saved" && "Saved — every open survey has been repriced."}
        </span>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  step = 1,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
