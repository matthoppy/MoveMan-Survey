import fs from "node:fs";
import { serviceClient, VIDEO_BUCKET } from "../supabase/server";
import { localPath, stageChunk } from "./local";
import type { ResolvedVideo, VideoStorage } from "./driver";

/** How long a playback link stays valid. Long enough to watch, short enough to leak harmlessly. */
const SIGNED_URL_SECONDS = 60 * 60;

/**
 * Object storage for finished recordings.
 *
 * Chunks are staged on local disk while the customer is still filming, then
 * the finished file is uploaded in one go and the staging copy deleted. That
 * keeps the property that matters — a recording survives the customer's phone
 * dying mid-survey — without needing object storage to support appends, which
 * it does not.
 *
 * The trade-off is that the server needs transient disk for the length of an
 * active recording. If you run this somewhere with no writable disk, upload
 * whole files only and drop the chunked capture path.
 */
export const supabaseStorage: VideoStorage = {
  name: "supabase",

  writeChunk(filename, body, append) {
    return stageChunk(filename, body, append);
  },

  async finalize(filename, mimeType) {
    const staged = localPath(filename);
    if (!fs.existsSync(staged)) return 0;

    const bytes = fs.statSync(staged).size;
    const file = await fs.promises.readFile(staged);

    const { error } = await serviceClient()
      .storage.from(VIDEO_BUCKET)
      .upload(filename, file, { contentType: mimeType, upsert: true });

    if (error) {
      // Leave the staged copy alone — it is the only copy, and losing a survey
      // video because an upload blipped is not acceptable. The recording is
      // still on the server's disk and playable; only the move to the bucket
      // failed, so switching VIDEO_STORAGE recovers it without re-filming.
      if (/maximum allowed size|exceeded/i.test(error.message)) {
        throw new Error(
          `This recording is ${Math.round(bytes / 1024 / 1024)} MB, which is larger than the ` +
            `Supabase project allows in one object — the free plan caps it at 50 MB, about three ` +
            `minutes of phone video. The recording is safe on the server's disk. Either set ` +
            `VIDEO_STORAGE=local to keep videos there, or raise the storage limit on a paid plan.`,
        );
      }
      throw new Error(`Could not store the video: ${error.message}`);
    }

    await fs.promises.rm(staged, { force: true });
    return bytes;
  },

  async resolve(filename): Promise<ResolvedVideo> {
    // A recording still in progress has not been uploaded yet.
    const staged = localPath(filename);
    if (fs.existsSync(staged)) {
      return { kind: "local", path: staged, sizeBytes: fs.statSync(staged).size };
    }

    const { data, error } = await serviceClient()
      .storage.from(VIDEO_BUCKET)
      .createSignedUrl(filename, SIGNED_URL_SECONDS);

    if (error || !data?.signedUrl) return { kind: "missing" };
    return { kind: "redirect", url: data.signedUrl };
  },

  async remove(filename) {
    const staged = localPath(filename);
    if (fs.existsSync(staged)) fs.rmSync(staged);
    await serviceClient().storage.from(VIDEO_BUCKET).remove([filename]);
  },
};
