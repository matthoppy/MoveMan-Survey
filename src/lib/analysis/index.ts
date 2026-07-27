import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { SURVEY_TOOL_NAME, SURVEY_TOOL_SCHEMA, type RawAnalysis } from "./schema";
import { normaliseAnalysis, type NormalisedAnalysis } from "./normalise";
import { offlineAnalyse } from "./offline";
import type { AccessDetails } from "../types";

/** Frames beyond this add cost without adding much signal. */
export const MAX_FRAMES = 24;

export interface AnalyseInput {
  /** Base64-encoded JPEG frames, chronological. No data: prefix. */
  frames: string[];
  transcript: string;
  durationSec: number | null;
  propertyNotes?: string;
}

export interface AnalyseResult extends NormalisedAnalysis {
  model: string | null;
  /** Access the analyser could infer from the video, for the surveyor to accept or override. */
  accessSuggestion: Partial<AccessDetails> | null;
  /** True when this came from the transcript-only fallback. */
  offline: boolean;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function analyseSurvey(input: AnalyseInput): Promise<AnalyseResult> {
  if (!isAiConfigured()) {
    const raw = offlineAnalyse(input.transcript);
    return { ...normaliseAnalysis(raw), model: null, accessSuggestion: null, offline: true };
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const frames = input.frames.slice(0, MAX_FRAMES);

  const content: Anthropic.ContentBlockParam[] = [];
  frames.forEach((data, i) => {
    content.push({ type: "text", text: `Frame ${i + 1} of ${frames.length}` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data },
    });
  });
  content.push({
    type: "text",
    text: buildUserPrompt({
      transcript: input.transcript,
      frameCount: frames.length,
      durationSec: input.durationSec,
      propertyNotes: input.propertyNotes,
    }),
  });

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: SURVEY_TOOL_NAME,
        description: "Record the complete survey findings for this property.",
        input_schema: SURVEY_TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: SURVEY_TOOL_NAME },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === SURVEY_TOOL_NAME,
  );

  if (!toolUse) {
    throw new Error("The analyser did not return a structured inventory. Try re-running the analysis.");
  }

  const raw = toolUse.input as RawAnalysis;
  const normalised = normaliseAnalysis(raw);

  return {
    ...normalised,
    model,
    accessSuggestion: toAccessSuggestion(raw),
    offline: false,
  };
}

function toAccessSuggestion(raw: RawAnalysis): Partial<AccessDetails> | null {
  const obs = raw.accessObservations;
  if (!obs) return null;

  const suggestion: Partial<AccessDetails> = {};
  if (typeof obs.floor === "number") {
    suggestion.floor = Math.min(4, Math.max(0, Math.round(obs.floor))) as AccessDetails["floor"];
  }
  if (typeof obs.liftAvailable === "boolean") suggestion.liftAvailable = obs.liftAvailable;
  if (typeof obs.awkwardStairs === "boolean") suggestion.awkwardStairs = obs.awkwardStairs;
  if (typeof obs.parkingRestricted === "boolean") suggestion.parkingRestricted = obs.parkingRestricted;
  if (typeof obs.hoistRequired === "boolean") suggestion.hoistRequired = obs.hoistRequired;

  return Object.keys(suggestion).length ? suggestion : null;
}

export { offlineAnalyse } from "./offline";
export { normaliseAnalysis, normaliseItem } from "./normalise";
