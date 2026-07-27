"use client";

import { extractAudioChunks } from "./audio";
import { joinTranscriptChunks } from "../transcript-join";

export interface TranscribeProgress {
  stage: "extracting" | "transcribing" | "done";
  chunk: number;
  totalChunks: number;
}

export interface TranscribeResult {
  transcript: string;
  chunkCount: number;
  /** The video had no audio, or nobody spoke on it. */
  silent: boolean;
}

/**
 * Transcribes a stored survey video.
 *
 * Audio is extracted and chunked in the browser, then each chunk goes to the
 * server one at a time. Sequential rather than parallel on purpose: the chunks
 * have to come back in order to read as one narration, and transcription APIs
 * rate-limit hard enough that firing six at once mostly earns you 429s.
 */
export async function transcribeVideo(opts: {
  surveyId: string;
  videoId: string;
  onProgress?: (progress: TranscribeProgress) => void;
  signal?: AbortSignal;
}): Promise<TranscribeResult> {
  const { surveyId, videoId, onProgress, signal } = opts;

  onProgress?.({ stage: "extracting", chunk: 0, totalChunks: 0 });

  const { chunks, silent } = await extractAudioChunks(`/api/videos/${videoId}`);

  if (chunks.length === 0 || silent) {
    return { transcript: "", chunkCount: 0, silent: true };
  }

  const parts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new DOMException("Transcription cancelled", "AbortError");
    onProgress?.({ stage: "transcribing", chunk: i + 1, totalChunks: chunks.length });

    const response = await fetch(`/api/surveys/${surveyId}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: chunks[i].blob,
      signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Transcription failed (${response.status})`);

    parts.push(data.text ?? "");
  }

  onProgress?.({ stage: "done", chunk: chunks.length, totalChunks: chunks.length });

  return {
    transcript: joinTranscriptChunks(parts),
    chunkCount: chunks.length,
    silent: false,
  };
}
