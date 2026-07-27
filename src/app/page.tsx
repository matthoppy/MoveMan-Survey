import Link from "next/link";
import { listSurveys } from "@/lib/db";
import { estimateSurvey } from "@/lib/estimate";
import { STATUS_CLASS, STATUS_LABEL, formatCuFt, formatDate } from "@/lib/format";
import { isAiConfigured } from "@/lib/analysis";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const surveys = listSurveys();
  const aiReady = isAiConfigured();

  const awaiting = surveys.filter((s) => s.status === "awaiting_video").length;
  const toReview = surveys.filter((s) => s.status === "video_received").length;

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>Surveys</h1>
          <p className="muted small">
            {surveys.length === 0
              ? "No surveys yet."
              : `${surveys.length} survey${surveys.length === 1 ? "" : "s"} · ${awaiting} awaiting video · ${toReview} ready to analyse`}
          </p>
        </div>
        <Link href="/surveys/new" className="btn btn-primary">
          New survey
        </Link>
      </div>

      {!aiReady && (
        <div className="notice notice-warning" style={{ marginBottom: "1rem" }}>
          <strong>AI analysis is not configured.</strong> Set <code>ANTHROPIC_API_KEY</code> in{" "}
          <code>.env.local</code> to have surveys read from the video. Until then the app falls back to a
          transcript-only estimate, which is deliberately conservative and must not be quoted from unchecked.
        </div>
      )}

      <div className="card">
        {surveys.length === 0 ? (
          <div className="empty">
            <p>
              <strong>Start with a survey.</strong>
            </p>
            <p className="small">
              Create one for the customer, send them the capture link, and their walkthrough video comes
              straight back here for pricing.
            </p>
            <Link href="/surveys/new" className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
              Create the first survey
            </Link>
          </div>
        ) : (
          <ul className="survey-list">
            {surveys.map((survey) => {
              const estimate = estimateSurvey({
                items: survey.items,
                rooms: survey.rooms,
                origin: survey.origin,
                destination: survey.destination,
                journey: survey.journey,
                packingDayBefore: survey.packingDayBefore,
              });

              return (
                <li key={survey.id}>
                  <Link href={`/surveys/${survey.id}`} className="survey-item">
                    <div className="spread">
                      <div className="grow">
                        <div className="row-tight">
                          <strong>{survey.clientName || "Unnamed customer"}</strong>
                          <span className={`badge ${STATUS_CLASS[survey.status]}`}>
                            {STATUS_LABEL[survey.status]}
                          </span>
                        </div>
                        <div className="small muted" style={{ marginTop: "0.15rem" }}>
                          <span className="mono">{survey.reference}</span>
                          {survey.originAddress && <> · {survey.originAddress}</>}
                          {survey.moveDate && <> · moving {formatDate(survey.moveDate)}</>}
                        </div>
                      </div>
                      <div className="nowrap small muted center">
                        {survey.items.length > 0 ? (
                          <>
                            <div>
                              <strong style={{ color: "var(--text)" }}>
                                {formatCuFt(estimate.volume.totalCuFt)}
                              </strong>
                            </div>
                            <div className="tiny">
                              {estimate.crew.crewSize} crew ·{" "}
                              {estimate.crew.vehicles.map((v) => `${v.count}× ${v.type}`).join(", ") || "no van"}
                            </div>
                          </>
                        ) : (
                          <span className="tiny faint">No inventory yet</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
