"use client";

/**
 * Uploads to the capture endpoint.
 *
 * Uses XMLHttpRequest rather than fetch purely for upload progress — a
 * customer sending a 400 MB video over a phone connection needs to see the
 * bar move, or they close the tab.
 */
export function uploadBlob(opts: {
  url: string;
  blob: Blob;
  mimeType: string;
  mode: "upload" | "recorded" | "live";
  durationSec?: number | null;
  videoId?: string | null;
  complete?: boolean;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<{ video: { id: string } }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", opts.url);
    xhr.setRequestHeader("Content-Type", opts.mimeType);
    xhr.setRequestHeader("x-capture-mode", opts.mode);
    if (opts.durationSec) xhr.setRequestHeader("x-duration-sec", String(opts.durationSec));
    if (opts.videoId) xhr.setRequestHeader("x-video-id", opts.videoId);
    xhr.setRequestHeader("x-complete", opts.complete === false ? "0" : "1");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) opts.onProgress?.(event.loaded / event.total);
    };

    xhr.onload = () => {
      let payload: { video?: { id: string }; error?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        /* fall through to the status check */
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload.video) {
        resolve({ video: payload.video });
      } else {
        reject(new Error(payload.error ?? `Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(opts.blob);
  });
}

/** Pick the best container this browser will actually record. */
export function pickRecorderMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ];

  if (typeof MediaRecorder === "undefined") return "video/webm";
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

/** The server stores by container, so strip the codec parameters off. */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim();
}
