"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessFields } from "@/components/AccessFields";
import { JourneyFields } from "@/components/JourneyFields";
import { DEFAULT_ACCESS, DEFAULT_JOURNEY, type AccessDetails, type JourneyDetails } from "@/lib/types";

export default function NewSurveyPage() {
  const router = useRouter();

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [originAddress, setOriginAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [origin, setOrigin] = useState<AccessDetails>(DEFAULT_ACCESS);
  const [destination, setDestination] = useState<AccessDetails>(DEFAULT_ACCESS);
  const [journey, setJourney] = useState<JourneyDetails>(DEFAULT_JOURNEY);
  const [packingDayBefore, setPackingDayBefore] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientEmail,
          clientPhone,
          originAddress,
          destinationAddress,
          moveDate: moveDate || null,
          origin,
          destination,
          journey,
          packingDayBefore,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the survey");

      router.push(`/surveys/${data.survey.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <main className="container-narrow">
      <div className="page-head">
        <div>
          <h1>New survey</h1>
          <p className="muted small">
            Access and distance can be adjusted later — the video analysis will suggest some of it.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="stack">
        <section className="card">
          <div className="card-head">
            <h2>Customer</h2>
          </div>
          <div className="card-body stack-sm">
            <div className="field">
              <label className="label" htmlFor="client-name">
                Name
              </label>
              <input
                id="client-name"
                className="input"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="J. Whitfield"
              />
            </div>

            <div className="grid-2">
              <div className="field">
                <label className="label" htmlFor="client-email">
                  Email
                </label>
                <input
                  id="client-email"
                  className="input"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="client-phone">
                  Phone
                </label>
                <input
                  id="client-phone"
                  className="input"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label className="label" htmlFor="origin-address">
                  Collection address
                </label>
                <input
                  id="origin-address"
                  className="input"
                  value={originAddress}
                  onChange={(e) => setOriginAddress(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="destination-address">
                  Delivery address
                </label>
                <input
                  id="destination-address"
                  className="input"
                  value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="field" style={{ maxWidth: "220px" }}>
              <label className="label" htmlFor="move-date">
                Move date
              </label>
              <input
                id="move-date"
                className="input"
                type="date"
                value={moveDate}
                onChange={(e) => setMoveDate(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Journey</h2>
          </div>
          <div className="card-body">
            <JourneyFields value={journey} onChange={setJourney} />
          </div>
        </section>

        <div className="grid-2">
          <section className="card">
            <div className="card-head">
              <h2>Access at collection</h2>
            </div>
            <div className="card-body">
              <AccessFields value={origin} onChange={setOrigin} idPrefix="origin" />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Access at delivery</h2>
            </div>
            <div className="card-body">
              <AccessFields value={destination} onChange={setDestination} idPrefix="destination" />
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-body">
            <label className="check">
              <input
                type="checkbox"
                checked={packingDayBefore}
                onChange={(e) => setPackingDayBefore(e.target.checked)}
              />
              Crew packs the day before the move
            </label>
            <p className="hint" style={{ marginTop: "0.35rem" }}>
              Takes packing off moving day, which usually means a smaller crew on the day itself.
            </p>
          </div>
        </section>

        {error && <div className="notice notice-danger">{error}</div>}

        <div className="row">
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving || !clientName.trim()}>
            {saving ? "Creating…" : "Create survey"}
          </button>
        </div>
      </form>
    </main>
  );
}
