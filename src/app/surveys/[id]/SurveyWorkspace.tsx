"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AccessFields } from "@/components/AccessFields";
import { JourneyFields } from "@/components/JourneyFields";
import { EstimatePanel } from "@/components/EstimatePanel";
import { InventoryTable } from "@/components/InventoryTable";
import { VideoPanel } from "@/components/VideoPanel";
import { STATUS_CLASS, STATUS_LABEL, formatDate, formatDateTime } from "@/lib/format";
import type { SurveyView } from "@/lib/survey-view";
import type { AccessDetails, InventoryItem, JourneyDetails, RoomSurvey } from "@/lib/types";

type Tab = "survey" | "job" | "transcript";

export function SurveyWorkspace({
  initialSurvey,
  aiConfigured,
  captureBaseUrl,
}: {
  initialSurvey: SurveyView;
  aiConfigured: boolean;
  captureBaseUrl: string;
}) {
  const [survey, setSurvey] = useState(initialSurvey);
  const [tab, setTab] = useState<Tab>("survey");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown> | null>(null);

  /**
   * Patches are debounced and coalesced: typing in a number field shouldn't
   * fire a request per keystroke, but the estimate on screen has to move
   * immediately, so state updates locally and the server catches up.
   */
  const save = useCallback(
    (patch: Record<string, unknown>) => {
      pending.current = { ...(pending.current ?? {}), ...patch };
      setSaveState("saving");

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const body = pending.current;
        pending.current = null;
        if (!body) return;

        try {
          const response = await fetch(`/api/surveys/${survey.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);

          setSurvey(data.survey);
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, 500);
    },
    [survey.id],
  );

  useEffect(() => {
    if (saveState !== "saved") return;
    const id = setTimeout(() => setSaveState("idle"), 1800);
    return () => clearTimeout(id);
  }, [saveState]);

  const setItems = (items: InventoryItem[]) => {
    setSurvey((s) => ({ ...s, items }));
    save({ items });
  };

  const setRooms = (rooms: RoomSurvey[]) => {
    setSurvey((s) => ({ ...s, rooms }));
    save({ rooms });
  };

  const setAccess = (which: "origin" | "destination", value: AccessDetails) => {
    setSurvey((s) => ({ ...s, [which]: value }));
    save({ [which]: value });
  };

  const setJourney = (journey: JourneyDetails) => {
    setSurvey((s) => ({ ...s, journey }));
    save({ journey });
  };

  const captureUrl = `${captureBaseUrl}/capture/${survey.captureToken}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(captureUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <div className="row-tight">
            <h1>{survey.clientName || "Unnamed customer"}</h1>
            <span className={`badge ${STATUS_CLASS[survey.status]}`}>{STATUS_LABEL[survey.status]}</span>
          </div>
          <p className="muted small" style={{ marginTop: "0.2rem" }}>
            <span className="mono">{survey.reference}</span>
            {survey.originAddress && <> · {survey.originAddress}</>}
            {survey.destinationAddress && <> → {survey.destinationAddress}</>}
            {survey.moveDate && <> · moving {formatDate(survey.moveDate)}</>}
          </p>
        </div>

        <div className="row-tight no-print">
          <span className="tiny faint" aria-live="polite">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && <span style={{ color: "var(--danger)" }}>Save failed</span>}
          </span>
          <button className="btn btn-sm" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: "1.25rem" }}>
        <div className="card-body">
          <div className="field">
            <span className="label">Customer capture link</span>
            <div className="link-box">
              <code>{captureUrl}</code>
              <button className="btn btn-sm" onClick={copyLink}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="hint">
              Send this to the customer. They can record the walkthrough on their phone or upload a video
              they&apos;ve already taken — no login, no app.
            </p>
          </div>
        </div>
      </div>

      {survey.analysisSummary && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <div className="card-head">
            <h2>Surveyor&apos;s read</h2>
            <span className="tiny faint">
              {survey.analysisModel ? `${survey.analysisModel} · ` : "transcript only · "}
              {formatDateTime(survey.analysedAt)}
            </span>
          </div>
          <div className="card-body stack-sm">
            <p className="small">{survey.analysisSummary}</p>
            {survey.analysisFlags.length > 0 && (
              <div className="notice notice-warning">
                <strong>Confirm with the customer</strong>
                <ul>
                  {survey.analysisFlags.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="workspace">
        <div className="stack">
          <div className="card no-print">
            <div className="tabs">
              <button className="tab" role="tab" aria-selected={tab === "survey"} onClick={() => setTab("survey")}>
                Video &amp; inventory
              </button>
              <button className="tab" role="tab" aria-selected={tab === "job"} onClick={() => setTab("job")}>
                Access &amp; journey
              </button>
              <button
                className="tab"
                role="tab"
                aria-selected={tab === "transcript"}
                onClick={() => setTab("transcript")}
              >
                Transcript
              </button>
            </div>
          </div>

          {tab === "survey" && (
            <>
              <VideoPanel survey={survey} onSurveyChange={setSurvey} aiConfigured={aiConfigured} />
              <InventoryTable
                items={survey.items}
                rooms={survey.rooms}
                onItemsChange={setItems}
                onRoomsChange={setRooms}
              />
            </>
          )}

          {tab === "job" && (
            <>
              <section className="card">
                <div className="card-head">
                  <h2>Journey</h2>
                </div>
                <div className="card-body stack">
                  <JourneyFields value={survey.journey} onChange={setJourney} />
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={survey.packingDayBefore}
                      onChange={(e) => {
                        setSurvey((s) => ({ ...s, packingDayBefore: e.target.checked }));
                        save({ packingDayBefore: e.target.checked });
                      }}
                    />
                    Crew packs the day before the move
                  </label>
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>Access at collection</h2>
                </div>
                <div className="card-body">
                  <AccessFields
                    value={survey.origin}
                    onChange={(value) => setAccess("origin", value)}
                    idPrefix="origin"
                  />
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>Access at delivery</h2>
                </div>
                <div className="card-body">
                  <AccessFields
                    value={survey.destination}
                    onChange={(value) => setAccess("destination", value)}
                    idPrefix="destination"
                  />
                </div>
              </section>
            </>
          )}

          {tab === "transcript" && (
            <section className="card">
              <div className="card-head">
                <h2>Narration transcript</h2>
                <span className="tiny faint">{survey.transcript.length} characters</span>
              </div>
              <div className="card-body stack-sm">
                <p className="hint">
                  Captured live while the customer narrates, where their browser supports it. Correct it here
                  before re-analysing — what the customer says is what tells us an item is staying behind.
                </p>
                <textarea
                  className="textarea"
                  style={{ minHeight: "260px" }}
                  value={survey.transcript}
                  placeholder="No narration was captured. Paste or type what the customer said."
                  onChange={(e) => {
                    setSurvey((s) => ({ ...s, transcript: e.target.value }));
                    save({ transcript: e.target.value });
                  }}
                />
              </div>
            </section>
          )}
        </div>

        <EstimatePanel estimate={survey.estimate} />
      </div>
    </main>
  );
}
