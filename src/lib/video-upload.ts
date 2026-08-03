import {
  createVideo,
  getVideo,
  getVideoByToken,
  updateVideo,
  updateSurvey,
  upsertVideoByToken,
} from "./db";
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
  /**
   * Set when the upload arrived through a customer capture link. The write is
   * then authorised by the token inside the database rather than by a session,
   * so the customer-facing path needs no privileged credentials at all.
   */
  captureToken?: string;
  /** Content-Length, so a body that stops short can be told from one that finished. */
  expectedBytes?: number | null;
}

/** Thrown when fewer bytes arrived than the client said it was sending. */
export class UploadTruncatedError extends Error {
  constructor(
    readonly received: number,
    readonly expected: number,
  ) {
    super(
      `Only ${Math.round(received / 1024 / 1024)} MB of a ${Math.round(expected / 1024 / 1024)} MB ` +
        `upload arrived, so the video would have been cut short. Nothing has been saved.`,
    );
    this.name = "UploadTruncatedError";
  }
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
  const { survey, body, mimeType, mode, durationSec, videoId, complete, captureToken } = options;
  const expectedBytes = options.expectedBytes ?? null;

  const appending = Boolean(videoId);
  const filename = videoId
    ? (await resolveFilename(videoId, survey.id, captureToken))
    : `${survey.id}-${Date.now()}.${extensionFor(mimeType)}`;

  const storage = getStorage();
  const written = await storage.writeChunk(filename, body, appending);

  /**
   * A body that ends early ends cleanly, so nothing throws.
   *
   * This is not hypothetical: the request body is capped somewhere above this
   * code at about 10 MB, and before this check a 300 MB survey was written as
   * its first 10 MB, marked complete, and reported back as a successful
   * upload. The office would have priced a house from the hallway. Content-
   * Length is what the client said it was sending, so anything less than that
   * is a truncated file and must not be passed off as a recording.
   */
  if (expectedBytes !== null && written.writtenBytes < expectedBytes) {
    throw new UploadTruncatedError(written.writtenBytes, expectedBytes);
  }

  let sizeBytes = written.totalBytes;
  if (complete) sizeBytes = await storage.finalize(filename, mimeType);

  if (captureToken) {
    return upsertVideoByToken(captureToken, {
      videoId: videoId ?? null,
      filename,
      mimeType,
      sizeBytes,
      durationSec,
      mode,
      complete,
    });
  }

  let video = videoId ? await getVideo(videoId) : null;
  if (!video) {
    video = await createVideo({
      surveyId: survey.id,
      filename,
      mimeType,
      sizeBytes,
      durationSec,
      mode,
      complete,
    });
  } else {
    video = (await updateVideo(video.id, {
      sizeBytes,
      durationSec: durationSec ?? video.durationSec,
      complete,
    }))!;
  }

  if (complete && survey.status === "awaiting_video") {
    await updateSurvey(survey.id, { status: "video_received" });
  }

  return video;
}

/**
 * The filename of a recording already in progress. Checked against the survey
 * so a stray video id cannot be used to append to somebody else's recording.
 */
async function resolveFilename(
  videoId: string,
  surveyId: string,
  captureToken: string | undefined,
): Promise<string> {
  // A capture link has no session, so the lookup is scoped by its token; the
  // office side goes through row-level security as usual.
  const existing = captureToken
    ? await getVideoByToken(captureToken, videoId)
    : await getVideo(videoId);

  if (!existing || existing.surveyId !== surveyId) {
    throw new Error("That recording belongs to a different survey.");
  }
  return existing.filename;
}

export async function deleteVideoFile(video: VideoRecord): Promise<void> {
  await getStorage().remove(video.filename);
}
