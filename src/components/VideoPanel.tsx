"use client";

import { useEffect, useRef, useState } from "react";
import { extractFrames } from "@/lib/client/frames";
import { transcribeVideo } from "@/lib/client/transcribe";
import { baseMimeType, uploadBlob } from "@/lib/client/upload";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import type { SurveyView } from "@/lib/survey-view";

type Phase = "idle" | "uploading" | "extracting" | "transcribing" | "analysing";

export function VideoPanel({
  survey,
  onSurveyChange,
  aiConfigured,
  transcriptionConfigured,
}: {
  survey: SurveyView;
  onSurveyChange: (survey: SurveyView) => void;
  aiConfigured: boolean;
  transcriptionConfigured: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(survey.videos[0]?.id ?? null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keepManual, setKeepManual] = useState(true);
  const [applyAccess, setApplyAccess] = useState(true);
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!selectedId && survey.videos.length > 0) setSelectedId(survey.videos[0].id);
  }, [survey.videos, selectedId]);

  const selected = survey.videos.find((v) => v.id === selectedId) ?? survey.videos[0] ?? null;
  const busy = phase !== "idle";

  async function handleUpload(file: File) {
    setError(null);
    setMessage(null);
    setPhase("uploading");
    setProgress(0);

    try {
      const result = await uploadBlob({
        url: `/api/surveys/${survey.id}/video`,
        blob: file,
        mimeType: baseMimeType(file.type),
        mode: "upload",
        complete: true,
        onProgress: setProgress,
      });

      const refreshed = await refreshSurvey(survey.id);
      onSurveyChange(refreshed);
      setSelectedId(result.video.id);
      setMessage("Video uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhase("idle");
      setProgress(0);
    }
  }

  /**
   * Extracts the narration from the video and stores it against the survey.
   * Returns the transcript so the analysis can use it straight away rather
   * than waiting for the survey to round-trip.
   */
  async function runTranscription(videoId: string): Promise<string> {
    setPhase("transcribing");
    setChunkProgress(null);

    const result = await transcribeVideo({
      surveyId: survey.id,
      videoId,
      onProgress: (p) =>
        setChunkProgress(p.totalChunks > 0 ? { done: p.chunk, total: p.totalChunks } : null),
    });

    if (result.silent || !result.transcript) return "";

    const response = await fetch(`/api/surveys/${survey.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: result.transcript }),
    });
    const data = await response.json();
    if (response.ok) onSurveyChange(data.survey);

    return result.transcript;
  }

  async function handleTranscribe() {
    if (!selected) return;

    setError(null);
    setMessage(null);

    try {
      const transcript = await runTranscription(selected.id);
      setMessage(
        transcript
          ? `Narration transcribed — ${transcript.split(/\s+/).length} words. Check it on the Transcript tab, then analyse.`
          : "No speech was found on this recording. The customer may have filmed without narrating.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setPhase("idle");
      setChunkProgress(null);
    }
  }

  async function handleAnalyse() {
    if (!selected) return;

    setError(null);
    setMessage(null);
    setProgress(0);

    try {
      // A survey with no narration loses most of its signal — what is staying
      // behind, who is packing — so transcribe first if we can.
      let transcript = survey.transcript;
      if (!transcript.trim() && transcriptionConfigured) {
        transcript = await runTranscription(selected.id);
      }

      setPhase("extracting");
      const { frames, durationSec } = await extractFrames(`/api/videos/${selected.id}`, {
        count: 20,
        onProgress: (done, total) => setProgress(done / total),
      });

      if (frames.length === 0) {
        throw new Error("No frames could be read from this video.");
      }

      setPhase("analysing");
      const response = await fetch(`/api/surveys/${survey.id}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames,
          durationSec,
          transcript: transcript || undefined,
          keepManualItems: keepManual,
          applyAccessSuggestion: applyAccess,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Analysis failed");

      onSurveyChange(data.survey);
      setMessage(
        data.offline
          ? "Estimated from the transcript only — no API key is configured, so the video was not read."
          : `Analysed ${frames.length} frames. Check the flags before quoting.`,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setPhase("idle");
      setProgress(0);
      setChunkProgress(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Survey video</h2>
        <label className="btn btn-sm" style={{ cursor: busy ? "not-allowed" : "pointer" }}>
          Upload
          <input
            type="file"
            accept="video/*"
            hidden
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="card-body stack">
        {survey.videos.length === 0 ? (
          <div className="empty">
            <p className="small">
              No video yet. Send the customer their capture link, or upload a video they&apos;ve emailed over.
            </p>
          </div>
        ) : (
          <>
            {selected && (
              <video
                ref={videoRef}
                className="video-frame"
                controls
                preload="metadata"
                src={`/api/videos/${selected.id}`}
              />
            )}

            {survey.videos.length > 1 && (
              <div className="field">
                <label className="label" htmlFor="video-select">
                  Recording
                </label>
                <select
                  id="video-select"
                  className="select"
                  value={selected?.id ?? ""}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {survey.videos.map((video) => (
                    <option key={video.id} value={video.id}>
                      {formatDateTime(video.createdAt)} · {formatDuration(video.durationSec)} ·{" "}
                      {formatBytes(video.sizeBytes)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selected && (
              <div className="row-tight tiny faint">
                <span className="badge badge-neutral">{selected.mode}</span>
                <span>{formatDuration(selected.durationSec)}</span>
                <span>·</span>
                <span>{formatBytes(selected.sizeBytes)}</span>
                <span>·</span>
                <span>received {formatDateTime(selected.createdAt)}</span>
                {!selected.complete && <span className="badge badge-warning">still uploading</span>}
              </div>
            )}
          </>
        )}

        {busy && (
          <div className="stack-sm">
            <div className="progress">
              <div
                className="progress-bar"
                style={{ width: phase === "analysing" ? "100%" : `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="tiny muted">
              {phase === "uploading" && "Uploading video…"}
              {phase === "extracting" && `Reading frames from the video… ${Math.round(progress * 100)}%`}
              {phase === "transcribing" &&
                (chunkProgress
                  ? `Transcribing narration — part ${chunkProgress.done} of ${chunkProgress.total}…`
                  : "Extracting the audio from the recording…")}
              {phase === "analysing" && "Working through the survey — this takes up to a minute."}
            </span>
          </div>
        )}

        {error && <div className="notice notice-danger">{error}</div>}
        {message && <div className="notice notice-success">{message}</div>}

        {survey.videos.length > 0 && (
          <>
            <div className="stack-sm">
              <label className="check tiny">
                <input type="checkbox" checked={keepManual} onChange={(e) => setKeepManual(e.target.checked)} />
                Keep items I added by hand
              </label>
              <label className="check tiny">
                <input type="checkbox" checked={applyAccess} onChange={(e) => setApplyAccess(e.target.checked)} />
                Apply access details spotted in the video
              </label>
            </div>

            <button
              className="btn btn-primary btn-block"
              onClick={handleAnalyse}
              disabled={busy || !selected}
            >
              {survey.analysedAt ? "Re-analyse video" : "Analyse video"}
            </button>

            {transcriptionConfigured && (
              <button className="btn btn-block" onClick={handleTranscribe} disabled={busy || !selected}>
                {survey.transcript.trim() ? "Re-transcribe narration" : "Transcribe narration only"}
              </button>
            )}

            {!aiConfigured && (
              <p className="hint">
                No <code>ANTHROPIC_API_KEY</code> is set, so this will fall back to reading the narration
                transcript only.
              </p>
            )}

            {!transcriptionConfigured && !survey.transcript.trim() && (
              <p className="hint">
                No narration transcript. The browser only captures speech live on some browsers — set{" "}
                <code>TRANSCRIPTION_API_KEY</code> to transcribe the audio from any recording.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export async function refreshSurvey(id: string): Promise<SurveyView> {
  const response = await fetch(`/api/surveys/${id}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not reload the survey");
  return data.survey;
}
