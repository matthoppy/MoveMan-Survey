import { notFound } from "next/navigation";
import { getSurveyByToken } from "@/lib/db";
import { CaptureClient } from "./CaptureClient";

export const dynamic = "force-dynamic";

export default async function CapturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = getSurveyByToken(token);
  if (!survey) notFound();

  return (
    <CaptureClient
      token={token}
      clientName={survey.clientName}
      reference={survey.reference}
      alreadySubmitted={survey.status !== "awaiting_video"}
    />
  );
}
