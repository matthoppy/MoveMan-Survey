import { createVideo, getVideo, updateVideo, updateSurvey } from "./db";
import { getStorage } from "./storage";
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
 * Write an upload to storage, streaming it rather than buffering — survey
 * videos routinely run to hundreds of megabytes.
 *
 * Passing an existing `videoId` appends, which is how live capture works: the
 * browser posts each MediaRecorder chunk as it is produced, so the recording
 * is already safe if the client's phone dies halfway round the house.
 */
export async function storeUpload(options: UploadOptions): Promise<VideoRecord> {
  const { survey, body, mimeType, mode, durationSec, videoId, complete } = options;

  let video = videoId ? await getVideo(videoId) : null;
  if (video && video.surveyId !== survey.id) {
    throw new Error("That recording belongs to a different survey.");
  }

  const appending = Boolean(video);
  if (!video) {
    const filename = `${survey.id}-${Date.now()}.${extensionFor(mimeType)}`;
    video = await createVideo({
      surveyId: survey.id,
      filename,
      mimeType,
      sizeBytes: 0,
      durationSec,
      mode,
      complete: false,
    });
  }

  const storage = getStorage();
  let sizeBytes = await storage.writeChunk(video.filename, body, appending);

  if (complete) {
    sizeBytes = await storage.finalize(video.filename, mimeType);
  }

  const updated = (await updateVideo(video.id, {
    sizeBytes,
    durationSec: durationSec ?? video.durationSec,
    complete,
  }))!;

  if (complete && survey.status === "awaiting_video") {
    await updateSurvey(survey.id, { status: "video_received" });
  }

  return updated;
}

export async function deleteVideoFile(video: VideoRecord): Promise<void> {
  await getStorage().remove(video.filename);
}
