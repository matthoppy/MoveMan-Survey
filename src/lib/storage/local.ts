import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { videoDir } from "../paths";
import type { ResolvedVideo, VideoStorage } from "./driver";

export function localPath(filename: string): string {
  return path.join(videoDir(), filename);
}

export async function stageChunk(
  filename: string,
  body: ReadableStream<Uint8Array> | null,
  append: boolean,
): Promise<number> {
  const target = localPath(filename);

  if (body) {
    const out = fs.createWriteStream(target, { flags: append ? "a" : "w" });
    await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), out);
  } else if (!append && !fs.existsSync(target)) {
    // A finalise call with no body on a recording that never sent one.
    fs.writeFileSync(target, "");
  }

  return fs.existsSync(target) ? fs.statSync(target).size : 0;
}

/** Keeps everything on the machine running the app. Fine for one office. */
export const localStorage: VideoStorage = {
  name: "local",

  writeChunk(filename, body, append) {
    return stageChunk(filename, body, append);
  },

  async finalize(filename) {
    const target = localPath(filename);
    return fs.existsSync(target) ? fs.statSync(target).size : 0;
  },

  async resolve(filename): Promise<ResolvedVideo> {
    const target = localPath(filename);
    if (!fs.existsSync(target)) return { kind: "missing" };
    return { kind: "local", path: target, sizeBytes: fs.statSync(target).size };
  },

  async remove(filename) {
    const target = localPath(filename);
    if (fs.existsSync(target)) fs.rmSync(target);
  },
};
