import { notFound } from "next/navigation";
import { getSurveyByToken } from "@/lib/db";
import { companyIdentity } from "@/lib/company";
import { retentionDescription } from "@/lib/retention";
import { CaptureClient } from "./CaptureClient";

export const dynamic = "force-dynamic";

export default async function CapturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await getSurveyByToken(token);
  if (!survey) notFound();

  return (
    <CaptureClient
      token={token}
      clientName={survey.clientName}
      reference={survey.reference}
      alreadySubmitted={survey.status !== "awaiting_video"}
      // Resolved on the server so the notice states the same retention window
      // the purge actually enforces, rather than a number hard-coded in the UI.
      alreadyConsented={Boolean(survey.consentedAt)}
      companyName={companyIdentity().name}
      retention={retentionDescription()}
    />
  );
}
