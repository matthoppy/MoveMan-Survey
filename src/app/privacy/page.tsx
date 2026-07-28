import Link from "next/link";
import { companyIdentity } from "@/lib/company";
import { retentionDescription } from "@/lib/retention";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How we handle your survey video",
};

/**
 * The notice a customer is pointed at before they film their house.
 *
 * Written to be read on a phone by someone who is about to walk round their
 * own home with the camera on — plain sentences, no defined terms, and the
 * two things they actually want to know (how long you keep it, how they get
 * rid of it) near the top rather than buried at the bottom.
 */
export default function PrivacyPage() {
  const company = companyIdentity();
  const kept = retentionDescription();

  return (
    <main className="container-narrow">
      <div className="stack">
        <div>
          <h1>How we handle your survey video</h1>
          <p className="muted small">{company.name}</p>
        </div>

        {!company.configured && (
          <div className="notice notice-warning">
            <strong>This notice is not finished.</strong> Set{" "}
            <code>NEXT_PUBLIC_COMPANY_NAME</code> and{" "}
            <code>NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL</code> so it names your company and gives
            customers somewhere to write to. Until then it must not be shown to a real customer.
          </div>
        )}

        <section className="card">
          <div className="card-body stack-sm">
            <h2>The short version</h2>
            <p className="small">
              You film a walkthrough of your home so we can work out what needs moving and quote
              for it. We keep that video for <strong>{kept}</strong> and then delete it. Only staff
              at {company.name} watch it. You can ask us to delete it sooner and we will.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-body stack-sm">
            <h2>What we collect</h2>
            <ul className="small stack-sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>
              <li>
                <strong>The video and its sound</strong>, including anything visible in your rooms
                and anything said while recording.
              </li>
              <li>
                <strong>A written copy of what you said</strong>, because what you tell us is
                staying behind or coming with you is the most useful part of the survey.
              </li>
              <li>
                <strong>Your name, contact details and addresses</strong>, given to us when you
                asked for a quote.
              </li>
            </ul>
            <p className="hint">
              Film only what is moving. There is no need to open drawers of paperwork, show
              passports or bank statements, or record other people — and please don&apos;t.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-body stack-sm">
            <h2>What we do with it</h2>
            <p className="small">
              We use it to produce your quote: an inventory of your belongings, how much space they
              take, what packing materials are needed and how many people the move requires.
            </p>
            <p className="small">
              Part of that is automated. The video and what you said are sent to Anthropic&apos;s
              Claude, which reads them and drafts the inventory. A surveyor then checks and
              corrects it — the quote you receive is a person&apos;s decision, not a machine&apos;s.
              Anthropic does not use it to train their models.
            </p>
            <p className="small">
              If we cannot make out what you said, the audio may be sent to a transcription service
              to be written down. Nothing is used for advertising and nothing is sold.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-body stack-sm">
            <h2>How long we keep it</h2>
            <p className="small">
              Videos are deleted automatically <strong>{kept}</strong> after they are recorded. The
              inventory and quote are kept longer, as business records — but those are lists of
              furniture, not footage of your home.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-body stack-sm">
            <h2>Your rights</h2>
            <p className="small">
              You can ask for a copy of what we hold, ask us to correct it, or ask us to delete the
              video at any point — including as soon as we have quoted. You do not have to give a
              reason and it will not affect your quote.
            </p>
            {company.contactEmail ? (
              <p className="small">
                Write to <a href={`mailto:${company.contactEmail}`}>{company.contactEmail}</a>
                {company.postalAddress ? ` or ${company.postalAddress}` : ""}.
              </p>
            ) : (
              <p className="small muted">Contact address not yet configured.</p>
            )}
            <p className="hint">
              In the UK you can also complain to the Information Commissioner&apos;s Office at
              ico.org.uk.
            </p>
          </div>
        </section>

        <p className="tiny faint">
          <Link href="/">Back</Link>
        </p>
      </div>
    </main>
  );
}
