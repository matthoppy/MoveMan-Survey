"use client";

import { TARGET_SAMPLE_RATE, planChunks } from "../audio-chunking";

/**
 * Pulls the narration out of a survey video, in the browser, ready to send to
 * a speech-to-text service.
 *
 * The audio is downmixed to mono and resampled to 16 kHz — what speech models
 * want, and around a fortieth of the original file — then split into chunks
 * small enough for a transcription API to accept. Doing it here means the
 * server still never has to decode media.
 */

export interface AudioChunk {
  blob: Blob;
  startSec: number;
  endSec: number;
}

export interface ExtractAudioResult {
  chunks: AudioChunk[];
  durationSec: number;
  /** True when the file carried no audio track at all. */
  silent: boolean;
}

export async function extractAudioChunks(
  src: string,
  onProgress?: (stage: "downloading" | "decoding" | "resampling" | "encoding") => void,
): Promise<ExtractAudioResult> {
  onProgress?.("downloading");
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not read the video for transcription.");
  const encoded = await response.arrayBuffer();

  onProgress?.("decoding");
  const decoded = await decode(encoded);
  if (!decoded) return { chunks: [], durationSec: 0, silent: true };

  onProgress?.("resampling");
  const mono = await toMono16k(decoded);

  onProgress?.("encoding");
  return {
    chunks: chunkToWav(mono),
    durationSec: mono.length / TARGET_SAMPLE_RATE,
    silent: isSilent(mono),
  };
}

async function decode(encoded: ArrayBuffer): Promise<AudioBuffer | null> {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(encoded);
  } catch {
    // A video with no audio track, or a codec this browser can't decode.
    return null;
  } finally {
    void context.close();
  }
}

/** Downmix to one channel and resample to 16 kHz in a single offline render. */
async function toMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  const frames = Math.max(1, Math.ceil((buffer.duration * TARGET_SAMPLE_RATE) / 1));
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);

  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function chunkToWav(samples: Float32Array): AudioChunk[] {
  return planChunks(samples.length).map((range) => ({
    blob: encodeWav(samples.subarray(range.startFrame, range.endFrame)),
    startSec: range.startSec,
    endSec: range.endSec,
  }));
}

/** 16-bit PCM WAV — universally accepted and trivial to write. */
function encodeWav(samples: Float32Array): Blob {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Root-mean-square check for a track that is technically present but has
 * nothing on it — a muted phone, or the customer filming without speaking.
 */
function isSilent(samples: Float32Array): boolean {
  if (samples.length === 0) return true;

  // Sampling every 64th frame is plenty to tell silence from speech.
  let sum = 0;
  let counted = 0;
  for (let i = 0; i < samples.length; i += 64) {
    sum += samples[i] * samples[i];
    counted++;
  }

  return Math.sqrt(sum / counted) < 0.0005;
}
