/**
 * Speech-to-text for survey narration.
 *
 * What the customer says is the highest-signal part of a survey — it is what
 * tells you an item is staying behind, or that they want the kitchen packed.
 * The browser's own speech recognition only covers some browsers, so this
 * gives every survey a transcript regardless of what the customer filmed on.
 *
 * Deliberately provider-agnostic: it speaks the OpenAI audio-transcriptions
 * shape, which Whisper-compatible services (OpenAI, Groq, and self-hosted
 * whisper.cpp servers) all implement. Point TRANSCRIPTION_API_URL wherever you
 * like.
 */

const DEFAULT_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-1";

export function isTranscriptionConfigured(): boolean {
  return Boolean(process.env.TRANSCRIPTION_API_KEY);
}

export interface TranscribeOptions {
  audio: Blob;
  filename?: string;
  /** Nudges the model towards the vocabulary it is about to hear. */
  prompt?: string;
  language?: string;
  signal?: AbortSignal;
}

export async function transcribeAudio(options: TranscribeOptions): Promise<string> {
  const apiKey = process.env.TRANSCRIPTION_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Transcription is not configured. Set TRANSCRIPTION_API_KEY to have narration transcribed server-side.",
    );
  }

  const url = process.env.TRANSCRIPTION_API_URL || DEFAULT_URL;
  const model = process.env.TRANSCRIPTION_MODEL || DEFAULT_MODEL;

  const form = new FormData();
  form.append("file", options.audio, options.filename ?? "survey.wav");
  form.append("model", model);
  form.append("response_format", "text");
  form.append("language", options.language ?? process.env.TRANSCRIPTION_LANGUAGE ?? "en");
  if (options.prompt) form.append("prompt", options.prompt);

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Transcription failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  return (await response.text()).trim();
}

/**
 * Vocabulary hint sent with every chunk.
 *
 * Speech models otherwise mangle exactly the words that matter most here —
 * "settee" becomes "set A", carton sizes turn into nonsense — and a mangled
 * item is one that silently drops off the inventory.
 */
export const REMOVALS_PROMPT =
  "A home removals survey. The speaker walks through rooms describing furniture: settee, three-seater sofa, chest of drawers, wardrobe, divan, ottoman, sideboard, dresser, tumble dryer, fridge freezer, cot bed, bureau, cabin bed, loft, garage, utility room, conservatory, cubic feet, cartons, wardrobe boxes, part pack, full pack.";

export { joinTranscriptChunks } from "./transcript-join";
