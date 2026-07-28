import Link from "next/link";
import { notFound } from "next/navigation";
import { getSurvey } from "@/lib/db";
import { withSurveyEstimate } from "@/lib/survey-view";
import { companyIdentity } from "@/lib/company";
import { formatCuFt, formatDate, formatMoney } from "@/lib/format";
import { PrintButton } from "./PrintButton";
import type { QuoteLine } from "@/lib/pricing/types";

export const dynamic = "force-dynamic";

const SECTIONS: Array<[QuoteLine["section"], string]> = [
  ["labour", "Labour"],
  ["vehicles", "Vehicles"],
  ["travel", "Travel"],
  ["materials", "Packing materials"],
  ["adjustment", "Adjustment"],
];

/**
 * The two sheets a survey actually produces: a quote for the customer and a
 * picking list for the warehouse.
 *
 * Printed with CSS rather than generated as a PDF. A removals office prints
 * on paper or saves to PDF from the browser, and both come free — a PDF
 * library would be a dependency, a font-embedding problem and a second layout
 * to keep in step with this one.
 */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getSurvey(id);
  if (!record) notFound();

  const survey = await withSurveyEstimate(record);
  const { quote, estimate } = survey;
  const company = companyIdentity();

  return (
    <main className="container-narrow quote-sheet">
      <div className="page-head no-print">
        <div>
          <h1>Quote {survey.reference}</h1>
          <p className="muted small">Print this, or save it as a PDF from the print dialogue.</p>
        </div>
        <div className="row-tight">
          <PrintButton />
          <Link href={`/surveys/${survey.id}`} className="btn">
            Back to survey
          </Link>
        </div>
      </div>

      {!survey.ratesConfigured && (
        <div className="notice notice-danger no-print">
          <strong>Do not send this.</strong> No rates have been set, so every figure below came from
          example data. <Link href="/settings">Set your rates</Link> first.
        </div>
      )}

      {/* ---------------- Customer quote ---------------- */}
      <section className="card">
        <div className="card-body stack">
          <div className="spread">
            <div>
              <h2 style={{ margin: 0 }}>{company.name}</h2>
              <p className="tiny faint" style={{ margin: 0 }}>
                {company.postalAddress}
                {company.contactEmail ? ` · ${company.contactEmail}` : ""}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mono small">{survey.reference}</div>
              <div className="tiny faint">{formatDate(new Date().toISOString())}</div>
            </div>
          </div>

          <hr className="rule" />

          <div className="grid-2">
            <div>
              <div className="label">Customer</div>
              <p className="small" style={{ margin: 0 }}>
                {survey.clientName || "—"}
                {survey.clientEmail && (
                  <>
                    <br />
                    {survey.clientEmail}
                  </>
                )}
                {survey.clientPhone && (
                  <>
                    <br />
                    {survey.clientPhone}
                  </>
                )}
              </p>
            </div>
            <div>
              <div className="label">Move</div>
              <p className="small" style={{ margin: 0 }}>
                {survey.originAddress || "—"}
                <br />
                to {survey.destinationAddress || "—"}
                {survey.moveDate && (
                  <>
                    <br />
                    {formatDate(survey.moveDate)}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid-3">
            <Stat label="Volume" value={formatCuFt(estimate.volume.totalCuFt)} sub={`${estimate.volume.totalCubicMetres} m³`} />
            <Stat
              label="Crew"
              value={String(estimate.crew.crewSize)}
              sub={estimate.crew.moveDays > 1 ? `over ${estimate.crew.moveDays} days` : "for the day"}
            />
            <Stat
              label="Vehicles"
              value={estimate.crew.vehicles.reduce((n, v) => n + v.count, 0) || "—"}
              sub={estimate.crew.vehicles.map((v) => `${v.count}× ${v.type}`).join(", ") || ""}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>What you are being charged for</h2>
        </div>
        <div className="card-body">
          <table className="table table-sm">
            <tbody>
              {SECTIONS.map(([section, title]) => {
                const lines = quote.lines.filter((l) => l.section === section && l.total !== 0);
                if (lines.length === 0) return null;
                const total = lines.reduce((n, l) => n + l.total, 0);

                return (
                  <tr key={section}>
                    <td>
                      <strong>{title}</strong>
                      <div className="tiny faint">{summarise(section, lines)}</div>
                    </td>
                    <td className="num mono">{formatMoney(total, quote.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <hr className="rule" />

          <table className="table table-sm">
            <tbody>
              <tr>
                <td>Subtotal</td>
                <td className="num mono">{formatMoney(quote.subtotal, quote.currency)}</td>
              </tr>
              {quote.vat > 0 && (
                <tr>
                  <td>VAT</td>
                  <td className="num mono">{formatMoney(quote.vat, quote.currency)}</td>
                </tr>
              )}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="num mono">
                  <strong>{formatMoney(quote.total, quote.currency)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <p className="tiny faint" style={{ marginTop: "0.75rem" }}>
            Based on a video survey of {survey.originAddress || "the property"}. If there is more to
            move than was filmed — a loft, a garage, a shed — please tell us before the day so the
            crew and van are right.
          </p>
        </div>
      </section>

      {/* ---------------- Warehouse picking list ---------------- */}
      <section className="card page-break">
        <div className="card-head">
          <h2>Picking list — {survey.reference}</h2>
          <span className="tiny faint">warehouse copy, not for the customer</span>
        </div>
        <div className="card-body stack">
          <p className="tiny faint" style={{ margin: 0 }}>
            {survey.clientName} · {survey.originAddress}
            {survey.moveDate ? ` · ${formatDate(survey.moveDate)}` : ""} · crew of{" "}
            {estimate.crew.crewSize}
          </p>

          <table className="table table-sm">
            <thead>
              <tr>
                <th style={{ width: "3rem" }}>Qty</th>
                <th>Item</th>
                <th style={{ width: "5rem" }}>Code</th>
                <th style={{ width: "2rem" }} />
              </tr>
            </thead>
            <tbody>
              {estimate.materials.map((line) => (
                <tr key={line.sku}>
                  <td className="mono">
                    {line.quantity} {line.unit === "each" ? "" : line.unit}
                  </td>
                  <td>{line.name}</td>
                  <td className="mono tiny faint">{line.sku}</td>
                  {/* Printed empty for someone to tick off as they load. */}
                  <td style={{ borderLeft: "1px solid var(--border)" }} />
                </tr>
              ))}
            </tbody>
          </table>

          {estimate.crew.warnings.length > 0 && (
            <div className="notice notice-warning">
              <strong>Crew notes</strong>
              <ul>
                {estimate.crew.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

/** A one-line plain-English gloss, so a customer isn't reading rate-card arithmetic. */
function summarise(section: QuoteLine["section"], lines: QuoteLine[]): string {
  if (section === "labour") {
    const line = lines[0];
    return `${line.quantity} ${line.unit} — ${line.description.toLowerCase()}`;
  }
  if (section === "materials") {
    const count = lines.reduce((n, l) => n + (l.quantity ?? 0), 0);
    return `${count} item(s) of packing materials`;
  }
  return lines.map((l) => l.description).join(", ");
}
