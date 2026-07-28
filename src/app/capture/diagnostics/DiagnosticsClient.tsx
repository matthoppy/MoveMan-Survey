"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { baseMimeType, pickRecorderMimeType } from "@/lib/client/upload";
import { isSpeechSupported } from "@/lib/client/speech";
import { keepScreenAwake } from "@/lib/client/wakelock";

type Verdict = "pass" | "warn" | "fail" | "pending";

interface Result {
  name: string;
  verdict: Verdict;
  detail: string;
  /** What it means for a survey filmed on this phone. */
  consequence?: string;
}

const CODECS = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
];

/**
 * What this phone can actually do.
 *
 * The capture page is the one part of the app that runs on hardware nobody in
 * the office controls — a customer's five-year-old Android, an iPhone on
 * whatever iOS it shipped with. Automated tests run in headless Chromium with
 * a fake camera, which proves the code paths work and proves nothing about
 * Safari. This page is how a real handset gets checked in five minutes, and
 * how a customer who says "it didn't work" gets diagnosed without a site
 * visit.
 */
export function DiagnosticsClient() {
  const [results, setResults] = useState<Result[]>([]);
  const [recording, setRecording] = useState(false);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const add = useCallback((result: Result) => {
    setResults((current) => [...current.filter((r) => r.name !== result.name), result]);
  }, []);

  useEffect(() => {
    add({
      name: "Browser",
      verdict: "pass",
      detail: navigator.userAgent,
    });

    add({
      name: "Secure context",
      verdict: window.isSecureContext ? "pass" : "fail",
      detail: window.isSecureContext ? `${location.protocol}//` : `${location.protocol}// — not secure`,
      consequence: window.isSecureContext
        ? undefined
        : "Phone browsers refuse camera access outside HTTPS. Nobody can record from this address.",
    });

    const hasRecorder = typeof MediaRecorder !== "undefined";
    const hasCamera = Boolean(navigator.mediaDevices?.getUserMedia);

    add({
      name: "Camera API",
      verdict: hasCamera ? "pass" : "fail",
      detail: hasCamera ? "getUserMedia available" : "getUserMedia missing",
      consequence: hasCamera ? undefined : "This phone can only upload a video it already took.",
    });

    add({
      name: "Recorder API",
      verdict: hasRecorder ? "pass" : "fail",
      detail: hasRecorder ? "MediaRecorder available" : "MediaRecorder missing",
      consequence: hasRecorder ? undefined : "This phone can only upload a video it already took.",
    });

    if (hasRecorder) {
      const supported = CODECS.filter((type) => MediaRecorder.isTypeSupported(type));
      const chosen = pickRecorderMimeType();
      add({
        name: "Recording format",
        verdict: supported.length > 0 ? "pass" : "fail",
        detail: supported.length > 0 ? `${baseMimeType(chosen)} (from ${supported.length} supported)` : "none supported",
        consequence:
          supported.length > 0
            ? undefined
            : "MediaRecorder exists but will not record any format we can store.",
      });
    }

    const speech = isSpeechSupported();
    add({
      name: "Live speech-to-text",
      verdict: speech ? "pass" : "warn",
      detail: speech ? "supported" : "not supported by this browser",
      consequence: speech
        ? undefined
        : "Narration will be transcribed from the audio afterwards instead. Needs TRANSCRIPTION_API_KEY set, or the survey arrives with no transcript.",
    });

    const wakeLock = "wakeLock" in navigator;
    add({
      name: "Screen wake lock",
      verdict: wakeLock ? "pass" : "warn",
      detail: wakeLock ? "supported" : "not supported",
      consequence: wakeLock
        ? undefined
        : "The screen may sleep mid-walkthrough and stop the recording. Tell the customer to set their auto-lock to Never first.",
    });

    add({
      name: "Local storage",
      verdict: canUseStorage() ? "pass" : "warn",
      detail: canUseStorage() ? "writable" : "blocked (private browsing?)",
      consequence: canUseStorage()
        ? undefined
        : "A tab closed mid-survey will not offer to carry on where they left off.",
    });

    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const free = estimate.quota && estimate.usage ? estimate.quota - estimate.usage : null;
        add({
          name: "Free space",
          verdict: free === null ? "warn" : free > 200 * 1024 * 1024 ? "pass" : "warn",
          detail: free === null ? "unknown" : `${Math.round(free / (1024 * 1024))} MB available`,
        });
      });
    }
  }, [add]);

  /** Records five seconds and sends it nowhere, to prove the whole chain works. */
  async function testRecording() {
    setRecording(true);
    add({ name: "Live recording test", verdict: "pending", detail: "starting the camera…" });

    let stream: MediaStream | null = null;
    const release = keepScreenAwake();

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.() ?? {};
      add({
        name: "Camera",
        verdict: "pass",
        detail: `${settings.width ?? "?"}×${settings.height ?? "?"} · ${track?.label || "camera"}`,
      });
      add({
        name: "Microphone",
        verdict: stream.getAudioTracks().length > 0 ? "pass" : "fail",
        detail: stream.getAudioTracks()[0]?.label || "no audio track",
        consequence:
          stream.getAudioTracks().length > 0
            ? undefined
            : "No sound means no narration, which is most of the value of a survey.",
      });

      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start(1000);
      add({ name: "Live recording test", verdict: "pending", detail: "recording 5 seconds…" });
      await new Promise((r) => setTimeout(r, 5000));
      recorder.stop();
      await stopped;

      const total = chunks.reduce((n, c) => n + c.size, 0);
      const kbps = Math.round((total * 8) / 1000 / 5);

      add({
        name: "Live recording test",
        verdict: chunks.length >= 3 && total > 0 ? "pass" : "fail",
        detail: `${chunks.length} chunks, ${Math.round(total / 1024)} KB, about ${kbps} kbps`,
        consequence:
          chunks.length >= 3
            ? `An hour of survey would be roughly ${Math.round((kbps * 3600) / 8 / 1000)} MB.`
            : "The recorder produced too little to be a working recording.",
      });

      // Whether the chunks actually play back is the thing that silently
      // breaks on Safari, so check rather than assume.
      const playable = await canPlay(new Blob(chunks, { type: baseMimeType(mimeType) }));
      add({
        name: "Chunks play back",
        verdict: playable.ok ? "pass" : "fail",
        detail: playable.detail,
        consequence: playable.ok
          ? undefined
          : "Chunks record but do not reassemble into a playable video on this phone. Surveys from this device would arrive corrupt — report this.",
      });
    } catch (err) {
      add({
        name: "Live recording test",
        verdict: "fail",
        detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        consequence:
          err instanceof Error && err.name === "NotAllowedError"
            ? "Permission was refused. Check the site permissions for camera and microphone."
            : undefined,
      });
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      release.release();
      setRecording(false);
    }
  }

  async function copyReport() {
    const report = results
      .map((r) => `${r.verdict.toUpperCase()}\t${r.name}: ${r.detail}${r.consequence ? `\n\t→ ${r.consequence}` : ""}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const failures = results.filter((r) => r.verdict === "fail").length;
  const warnings = results.filter((r) => r.verdict === "warn").length;

  return (
    <main className="container-narrow">
      <div className="stack">
        <div>
          <h1>Device check</h1>
          <p className="muted small">
            Open this on the phone you want to test. Nothing is recorded, stored or sent.
          </p>
        </div>

        <div
          className={`notice ${failures > 0 ? "notice-danger" : warnings > 0 ? "notice-warning" : "notice-success"}`}
        >
          {failures > 0
            ? `${failures} thing${failures === 1 ? "" : "s"} would stop a survey on this phone.`
            : warnings > 0
              ? `This phone can film a survey, with ${warnings} thing${warnings === 1 ? "" : "s"} worth knowing.`
              : "This phone can film a survey."}
        </div>

        <section className="card">
          <div className="card-body stack">
            <video ref={videoRef} className="video-frame video-frame-portrait" muted playsInline />
            <button
              className="btn btn-record btn-lg btn-block"
              onClick={testRecording}
              disabled={recording}
            >
              {recording ? "Testing…" : "Test the camera for 5 seconds"}
            </button>
            <p className="hint center">
              This is the test that matters — everything above it is what the browser claims it can
              do.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Results</h2>
            <button className="btn btn-sm" onClick={copyReport}>
              {copied ? "Copied" : "Copy report"}
            </button>
          </div>
          <div className="card-body stack-sm">
            {results.map((result) => (
              <div key={result.name} className="stack-sm" style={{ gap: "0.15rem" }}>
                <div className="spread">
                  <strong className="small">{result.name}</strong>
                  <span className={`badge ${badgeClass(result.verdict)}`}>{result.verdict}</span>
                </div>
                <div className="tiny muted mono" style={{ wordBreak: "break-word" }}>
                  {result.detail}
                </div>
                {result.consequence && <div className="tiny faint">{result.consequence}</div>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function badgeClass(verdict: Verdict): string {
  if (verdict === "pass") return "badge-success";
  if (verdict === "warn") return "badge-warning";
  if (verdict === "fail") return "badge-danger";
  return "badge-muted";
}

function canUseStorage(): boolean {
  try {
    window.localStorage.setItem("removals-survey:probe", "1");
    window.localStorage.removeItem("removals-survey:probe");
    return true;
  } catch {
    return false;
  }
}

/** Loads the recorded blob back and checks the browser can read a duration from it. */
function canPlay(blob: Blob): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const done = (ok: boolean, detail: string) => {
      URL.revokeObjectURL(url);
      resolve({ ok, detail });
    };

    const timer = setTimeout(() => done(false, "timed out reading the recording back"), 8000);

    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const seconds = Number.isFinite(video.duration) ? video.duration.toFixed(1) : "unknown";
      // A duration the browser cannot work out is normal for MediaRecorder
      // WebM and is handled during analysis, so it is not a failure on its own.
      done(true, `read back, duration ${seconds}s, ${video.videoWidth}×${video.videoHeight}`);
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(false, "the browser could not open its own recording");
    };

    video.src = url;
  });
}
