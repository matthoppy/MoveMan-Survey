import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { videoDir } from "./paths";
import { createVideo, getVideo, updateVideo, updateSurvey } from "./db";
import type { CaptureMode, SurveyRecord, VideoRecord } from "./types";

const EXTENSION_FOR: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/3gpp": "3gp",
};

export function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return EXTENSION_FOR[base] ?? "bin";
}

export function isSupportedVideoType(mimeType: string): boolean {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return base in EXTENSION_FOR;
}

export interface UploadOptions {
  survey: SurveyRecord;
  body: ReadableStream<Uint8Array> | null;
  mimeType: string;
  mode: CaptureMode;
  durationSec: number | null;
  /** Set to append to an existing recording rather than start a new one. */
  videoId?: string | null;
  /** False while a live capture is still streaming. */
  complete: boolean;
}

/**
 * Write an upload to disk, streaming it rather than buffering — survey videos
 * routinely run to hundreds of megabytes.
 *
 * Passing an existing `videoId` appends, which is how live capture works: the
 * browser posts each MediaRecorder chunk as it is produced, so the recording
 * is already safe on disk if the client's phone dies halfway round the house.
 */
export async function storeUpload(options: UploadOptions): Promise<VideoRecord> {
  const { survey, body, mimeType, mode, durationSec, videoId, complete } = options;

  let video = videoId ? getVideo(videoId) : null;
  if (video && video.surveyId !== survey.id) {
    throw new Error("That recording belongs to a different survey.");
  }

  const appending = Boolean(video);
  if (!video) {
    const filename = `${survey.id}-${Date.now()}.${extensionFor(mimeType)}`;
    video = createVideo({
      surveyId: survey.id,
      filename,
      mimeType,
      sizeBytes: 0,
      durationSec,
      mode,
      complete: false,
    });
  }

  const target = path.join(videoDir(), video.filename);

  if (body) {
    const out = fs.createWriteStream(target, { flags: appending ? "a" : "w" });
    await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), out);
  }

  const sizeBytes = fs.existsSync(target) ? fs.statSync(target).size : 0;
  const updated = updateVideo(video.id, {
    sizeBytes,
    durationSec: durationSec ?? video.durationSec,
    complete,
  })!;

  if (complete && survey.status === "awaiting_video") {
    updateSurvey(survey.id, { status: "video_received" });
  }

  return updated;
}

export function videoPath(video: VideoRecord): string {
  return path.join(videoDir(), video.filename);
}

export function deleteVideoFile(video: VideoRecord): void {
  const target = videoPath(video);
  if (fs.existsSync(target)) fs.rmSync(target);
}
