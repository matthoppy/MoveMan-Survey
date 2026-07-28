import Link from "next/link";
import { getRateCard } from "@/lib/db";
import { DEFAULT_RATE_CARD } from "@/lib/pricing";
import { RateCardForm } from "./RateCardForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Rates" };

export default async function SettingsPage() {
  const card = await getRateCard();

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>Rates</h1>
          <p className="muted small">
            What the survey costs. Everything else — cubic feet, man-hours, how many people fit on a
            staircase — is the same for every removals firm. This is the part that is yours.
          </p>
        </div>
        <Link href="/" className="btn">
          Back to surveys
        </Link>
      </div>

      <RateCardForm initial={card ?? DEFAULT_RATE_CARD} configured={card !== null} />
    </main>
  );
}
