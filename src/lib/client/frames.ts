"use client";

/**
 * Pulls still frames out of a video in the browser.
 *
 * Doing this client-side means the server needs no ffmpeg and never has to
 * decode video — it only ever stores bytes and forwards the frames we hand it.
 */

export interface ExtractOptions {
  /** How many frames to sample, spread evenly across the recording. */
  count?: number;
  /** Longest edge of each frame in pixels. */
  maxEdge?: number;
  quality?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface ExtractResult {
  /** Base64 JPEG data, without the data: prefix. */
  frames: string[];
  durationSec: number;
}

export async function extractFrames(src: string, options: ExtractOptions = {}): Promise<ExtractResult> {
  const { count = 16, maxEdge = 1024, quality = 0.72, onProgress, signal } = options;

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = src;

  try {
    const durationSec = await loadDuration(video);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error("Could not read the length of this video.");
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot process video frames.");

    // Skip the very start and end — they are usually a hand over the lens.
    const first = Math.min(0.5, durationSec * 0.02);
    const last = Math.max(first, durationSec - Math.min(0.5, durationSec * 0.02));
    const step = count > 1 ? (last - first) / (count - 1) : 0;

    const frames: string[] = [];

    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new DOMException("Frame extraction cancelled", "AbortError");

      await seekTo(video, first + step * i);

      const { videoWidth: w, videoHeight: h } = video;
      if (!w || !h) continue;

      const scale = Math.min(1, maxEdge / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      frames.push(canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "");
      onProgress?.(i + 1, count);
    }

    return { frames: frames.filter(Boolean), durationSec };
  } finally {
    video.src = "";
    video.removeAttribute("src");
    video.load();
  }
}

function loadDuration(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = () => reject(new Error("This video could not be opened for analysis."));

    video.addEventListener("error", onError, { once: true });
    video.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          resolve(video.duration);
          return;
        }
        // WebM written by MediaRecorder has no duration in its header until
        // the browser has scanned to the end. Seeking far past the end forces
        // it to work the real duration out.
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          const duration = Number.isFinite(video.duration) ? video.duration : video.seekable.end(0);
          video.currentTime = 0;
          resolve(duration);
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = Number.MAX_SAFE_INTEGER;
      },
      { once: true },
    );
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      // A frame we cannot reach is not worth failing the whole analysis over.
      resolve();
    }, 6000);

    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed while stepping through the video."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = Math.max(0, time);
  });
}
