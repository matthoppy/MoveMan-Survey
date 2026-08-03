"use client";

/**
 * Uploads to the capture endpoint.
 *
 * Uses XMLHttpRequest rather than fetch purely for upload progress — a
 * customer sending a 400 MB video over a phone connection needs to see the
 * bar move, or they close the tab.
 */
/**
 * An upload that failed, carrying enough to decide whether trying again is
 * worth anything. A 413 will fail identically forever; a dropped connection on
 * a phone walking past a lift almost certainly will not.
 */
export class UploadError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the request never got a reply. */
    readonly status: number,
  ) {
    super(message);
    this.name = "UploadError";
  }

  get retryable(): boolean {
    // No reply at all: the network went away. Retry.
    if (this.status === 0) return true;
    // 408 and 429 are explicit invitations to come back.
    if (this.status === 408 || this.status === 429) return true;
    // The server fell over or a proxy timed out — not the chunk's fault.
    if (this.status >= 500) return true;
    // Anything else in the 4xx range is a complaint about this request, and
    // sending it again unchanged just wastes the customer's battery.
    return false;
  }
}

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
        reject(new UploadError(payload.error ?? `Upload failed (${xhr.status})`, xhr.status));
      }
    };

    xhr.onerror = () =>
      reject(new UploadError("Upload failed — check your connection and try again.", 0));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(opts.blob);
  });
}

/**
 * How much of a file goes in one request.
 *
 * The request body is capped above this app at around 10 MB — a limit that
 * gave no error, just a silently truncated file — so a whole-file upload of
 * any real survey could never work. Five megabytes leaves room under that cap
 * and matches the size of the chunks live recording already sends, so both
 * paths exercise the same server code.
 */
const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;

/**
 * Sends a file the customer already had on their phone, in pieces.
 *
 * Identical on the wire to a live recording: the first piece creates the
 * video, the rest append to it by id, and the last one marks it complete. A
 * 300 MB holiday-length walkthrough goes up as sixty ordinary requests rather
 * than one that cannot succeed.
 */
export async function uploadFileInChunks(opts: {
  url: string;
  file: Blob;
  mimeType: string;
  durationSec?: number | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<{ video: { id: string } }> {
  const total = opts.file.size;
  let videoId: string | null = null;
  let sent = 0;
  let last: { video: { id: string } } | null = null;

  for (let start = 0; start < total; start += UPLOAD_CHUNK_BYTES) {
    const end = Math.min(start + UPLOAD_CHUNK_BYTES, total);
    const isLast = end >= total;

    last = await uploadBlob({
      url: opts.url,
      blob: opts.file.slice(start, end),
      mimeType: opts.mimeType,
      mode: "upload",
      videoId,
      // Duration is only known for the whole file, so it rides on the last
      // request — the one that closes the recording off.
      durationSec: isLast ? opts.durationSec : null,
      complete: isLast,
      signal: opts.signal,
      onProgress: (fraction) => opts.onProgress?.((sent + fraction * (end - start)) / total),
    });

    videoId = last.video.id;
    sent = end;
    opts.onProgress?.(sent / total);
  }

  if (!last) {
    // A zero-byte file would otherwise loop zero times and return nothing.
    throw new UploadError("That file is empty.", 0);
  }

  return last;
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
