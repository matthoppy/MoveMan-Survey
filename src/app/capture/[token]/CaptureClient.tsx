"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { baseMimeType, pickRecorderMimeType, uploadBlob } from "@/lib/client/upload";
import { isSpeechSupported, startTranscribing, type TranscriberHandle } from "@/lib/client/speech";
import { keepScreenAwake, type WakeLockHandle } from "@/lib/client/wakelock";

type Stage = "intro" | "recording" | "uploading" | "done";

const GUIDANCE = [
  "Walk through one room at a time and say the room name as you go in.",
  "Point the camera at everything that is coming with you — open wardrobes and cupboards.",
  "Say out loud if something is staying behind, being sold, or going to the tip.",
  "Tell us if you want us to pack a room, or if you are doing your own boxing.",
  "Don't forget the loft, garage, shed and garden.",
  "Finish outside: show us where the van can park and the way in to the front door.",
];

/** Sent to the server every 5 seconds so nothing is lost if the phone dies. */
const CHUNK_MS = 5000;

export function CaptureClient({
  token,
  clientName,
  reference,
  alreadySubmitted,
}: {
  token: string;
  clientName: string;
  reference: string;
  alreadySubmitted: boolean;
}) {
  const [stage, setStage] = useState<Stage>("intro");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [chunksSent, setChunksSent] = useState(0);
  const [resubmitting, setResubmitting] = useState(!alreadySubmitted);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const transcriberRef = useRef<TranscriberHandle | null>(null);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const videoIdRef = useRef<string | null>(null);
  const uploadChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const mimeRef = useRef<string>("video/webm");
  const startedAtRef = useRef<number>(0);
  const transcriptRef = useRef("");

  const uploadUrl = `/api/capture/${token}/video`;

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  useEffect(() => cleanupStream, [cleanupStream]);

  // Elapsed timer while recording.
  useEffect(() => {
    if (stage !== "recording") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [stage]);

  const pushTranscript = useCallback(
    async (final: string) => {
      if (!final) return;
      transcriptRef.current = `${transcriptRef.current}${transcriptRef.current ? " " : ""}${final}`;
      setTranscript(transcriptRef.current);
      setInterim("");

      try {
        await fetch(`/api/capture/${token}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: final, append: true }),
        });
      } catch {
        // The full transcript is sent again when the recording finishes, so a
        // dropped update here is not worth interrupting the customer for.
      }
    },
    [token],
  );

  async function startRecording() {
    setError(null);

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record video. Try Chrome or Safari, or upload a video you've already taken.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const mimeType = pickRecorderMimeType();
      mimeRef.current = baseMimeType(mimeType);

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        // Chain uploads so chunks land in the order they were recorded.
        uploadChainRef.current = uploadChainRef.current
          .then(() =>
            uploadBlob({
              url: uploadUrl,
              blob: event.data,
              mimeType: mimeRef.current,
              mode: "live",
              videoId: videoIdRef.current,
              complete: false,
            }),
          )
          .then((result) => {
            videoIdRef.current = (result as { video: { id: string } }).video.id;
            setChunksSent((n) => n + 1);
          })
          .catch((err: unknown) => {
            setError(
              err instanceof Error
                ? `Part of the recording didn't upload: ${err.message}`
                : "Part of the recording didn't upload.",
            );
          });
      };

      recorder.start(CHUNK_MS);
      // A phone that sleeps mid-walkthrough stops the recorder.
      wakeLockRef.current = keepScreenAwake();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setStage("recording");

      if (isSpeechSupported()) {
        transcriberRef.current = startTranscribing({
          onFinal: pushTranscript,
          onInterim: setInterim,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "We need permission to use your camera and microphone to record the survey."
          : "Couldn't start the camera. You can upload a video you've already taken instead.",
      );
      cleanupStream();
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;

    setStage("uploading");
    transcriberRef.current?.stop();
    transcriberRef.current = null;

    const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    cleanupStream();

    try {
      // Let every queued chunk land before marking the recording finished.
      await uploadChainRef.current;

      await uploadBlob({
        url: uploadUrl,
        blob: new Blob([], { type: mimeRef.current }),
        mimeType: mimeRef.current,
        mode: "live",
        videoId: videoIdRef.current,
        durationSec,
        complete: true,
        onProgress: setProgress,
      });

      if (transcriptRef.current) {
        await fetch(`/api/capture/${token}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: transcriptRef.current, append: false }),
        });
      }

      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The recording couldn't be saved.");
      setStage("intro");
    }
  }

  async function uploadFile(file: File) {
    setError(null);

    if (!file.type.startsWith("video/")) {
      setError("That doesn't look like a video file.");
      return;
    }

    setStage("uploading");
    setProgress(0);

    try {
      const durationSec = await readDuration(file).catch(() => null);

      await uploadBlob({
        url: uploadUrl,
        blob: file,
        mimeType: baseMimeType(file.type),
        mode: "upload",
        durationSec,
        complete: true,
        onProgress: setProgress,
      });

      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
      setStage("intro");
    }
  }

  if (alreadySubmitted && !resubmitting && stage !== "done") {
    return (
      <main className="container-narrow">
        <div className="card">
          <div className="card-body center stack">
            <h1>Thanks — we already have your survey</h1>
            <p className="muted">
              A video has been received for {reference}. Our surveyor is working through it and will be in
              touch.
            </p>
            <div>
              <button className="btn" onClick={() => setResubmitting(true)}>
                Send another video
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (stage === "done") {
    return (
      <main className="container-narrow">
        <div className="card">
          <div className="card-body center stack">
            <h1>Thank you</h1>
            <p className="muted">
              Your survey video has been sent to us. We&apos;ll work out what&apos;s needed for the move and
              come back to you with a quote.
            </p>
            <p className="tiny faint">Reference {reference}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container-narrow">
      <div className="stack">
        <div>
          <h1>Your home survey</h1>
          <p className="muted small">
            {clientName ? `${clientName} — ` : ""}reference {reference}
          </p>
        </div>

        {error && <div className="notice notice-danger">{error}</div>}

        {stage === "intro" && (
          <>
            <section className="card">
              <div className="card-head">
                <h2>How to film it</h2>
              </div>
              <div className="card-body">
                <ol className="stack-sm small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {GUIDANCE.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
                <p className="hint" style={{ marginTop: "0.75rem" }}>
                  Talking as you go makes a real difference — what you say is used to work out what&apos;s
                  coming and what isn&apos;t.
                </p>
              </div>
            </section>

            <section className="card">
              <div className="card-body stack">
                <button className="btn btn-record btn-lg btn-block" onClick={startRecording}>
                  Record the survey now
                </button>

                <div className="row" style={{ justifyContent: "center" }}>
                  <span className="tiny faint">or</span>
                </div>

                <label className="btn btn-lg btn-block" style={{ cursor: "pointer" }}>
                  Upload a video I&apos;ve already taken
                  <input
                    type="file"
                    accept="video/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadFile(file);
                    }}
                  />
                </label>

                <p className="hint center">
                  Recording sends the video to us as you go, so nothing is lost if your phone runs out of
                  battery.
                </p>
              </div>
            </section>
          </>
        )}

        {stage === "recording" && (
          <section className="card">
            <div className="card-body stack">
              <video ref={videoRef} className="video-frame video-frame-portrait" muted playsInline />

              <div className="spread">
                <div className="row-tight">
                  <span className="rec-dot" />
                  <strong className="mono">{formatElapsed(elapsed)}</strong>
                  <span className="tiny faint">{chunksSent > 0 ? "saved as you go" : "saving…"}</span>
                </div>
                <button className="btn btn-primary" onClick={stopRecording}>
                  Finish survey
                </button>
              </div>

              {isSpeechSupported() && (
                <div className="stack-sm">
                  <span className="label">What we&apos;re hearing</span>
                  <div className="small muted" style={{ minHeight: "3.2rem" }}>
                    {transcript.slice(-260)}
                    {interim && <span className="faint"> {interim}</span>}
                    {!transcript && !interim && <span className="faint">Start talking as you walk round…</span>}
                  </div>
                </div>
              )}

              <div className="notice notice-info tiny">
                Next: {GUIDANCE[Math.min(GUIDANCE.length - 1, Math.floor(elapsed / 45))]}
              </div>
            </div>
          </section>
        )}

        {stage === "uploading" && (
          <section className="card">
            <div className="card-body stack">
              <h2>Sending your video</h2>
              <div className="progress">
                <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="small muted">Please keep this page open until it finishes.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Read a file's duration by loading it into a detached video element. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the video"));
    };
    video.src = url;
  });
}
