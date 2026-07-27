import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSurvey } from "@/lib/db";
import { withSurveyEstimate } from "@/lib/survey-view";
import { isAiConfigured } from "@/lib/analysis";
import { isTranscriptionConfigured } from "@/lib/transcribe";
import { SurveyWorkspace } from "./SurveyWorkspace";

export const dynamic = "force-dynamic";

export default async function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) notFound();

  // Resolved on the server so the capture link renders identically on both
  // sides — deriving it from window.location on the client would hydrate
  // differently from the server-rendered HTML.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (await requestOrigin());

  return (
    <SurveyWorkspace
      initialSurvey={await withSurveyEstimate(survey)}
      aiConfigured={isAiConfigured()}
      transcriptionConfigured={isTranscriptionConfigured()}
      captureBaseUrl={baseUrl}
    />
  );
}

async function requestOrigin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
