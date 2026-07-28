"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { Quote, QuoteLine } from "@/lib/pricing/types";

const SECTION_TITLES: Record<QuoteLine["section"], string> = {
  labour: "Labour",
  vehicles: "Vehicles",
  travel: "Travel",
  materials: "Materials",
  adjustment: "Adjustment",
};

const ORDER: Array<QuoteLine["section"]> = ["labour", "vehicles", "travel", "materials", "adjustment"];

export function QuotePanel({
  quote,
  ratesConfigured,
  surveyId,
}: {
  quote: Quote;
  ratesConfigured: boolean;
  surveyId: string;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Price</h2>
        <Link href={`/surveys/${surveyId}/quote`} className="btn btn-sm no-print">
          Printable quote
        </Link>
      </div>

      <div className="card-body stack">
        {!ratesConfigured && (
          <div className="notice notice-warning small">
            <strong>These figures are examples, not your rates.</strong>{" "}
            <Link href="/settings">Set your rates</Link> before this goes to a customer.
          </div>
        )}

        <div className="grid-3">
          <div className="stat">
            <div className="stat-label">Net</div>
            <div className="stat-value">{formatMoney(quote.subtotal, quote.currency)}</div>
            <div className="stat-sub">before VAT</div>
          </div>
          <div className="stat">
            <div className="stat-label">VAT</div>
            <div className="stat-value">{formatMoney(quote.vat, quote.currency)}</div>
            <div className="stat-sub">{quote.vat === 0 ? "not registered" : ""}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Total</div>
            <div className="stat-value">{formatMoney(quote.total, quote.currency)}</div>
            <div className="stat-sub">{quote.minimumApplied ? "minimum applied" : "as surveyed"}</div>
          </div>
        </div>

        {quote.warnings.length > 0 && (
          <div className="notice notice-warning">
            <strong>Check before sending</strong>
            <ul>
              {quote.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="stack-sm">
          {ORDER.map((section) => {
            const lines = quote.lines.filter((l) => l.section === section && l.total !== 0);
            if (lines.length === 0) return null;
            const sectionTotal = lines.reduce((n, l) => n + l.total, 0);

            return (
              <details key={section} className="disclosure">
                <summary>
                  <span className="spread">
                    <strong className="small">{SECTION_TITLES[section]}</strong>
                    <span className="small mono">{formatMoney(sectionTotal, quote.currency)}</span>
                  </span>
                </summary>
                <table className="table table-sm">
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={`${line.description}-${i}`}>
                        <td>
                          {line.description}
                          {/* The basis is why the number is what it is. A
                              surveyor should be able to argue with a line
                              rather than take it on trust. */}
                          <div className="tiny faint">{line.basis}</div>
                        </td>
                        <td className="num tiny faint">
                          {line.quantity === null
                            ? ""
                            : `${line.quantity} ${line.unit} × ${formatMoney(line.unitPrice, quote.currency)}`}
                        </td>
                        <td className="num mono">{formatMoney(line.total, quote.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
