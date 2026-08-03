import { isSupabaseConfigured } from "../db";
import { localStorage } from "./local";
import type { VideoStorage } from "./driver";

let storage: VideoStorage | null = null;

export type StorageChoice = "local" | "supabase";

/**
 * Where finished videos go.
 *
 * Object storage used to be chosen by whether a service-role key happened to
 * be present, which made a consequential decision a side-effect of an
 * unrelated setting. It is now something you say out loud, because the two
 * options fail in different ways and neither is right for everyone:
 *
 *  - `local` keeps videos on the server's disk. On a single instance with a
 *    persistent volume — which this app requires anyway, since chunks are
 *    staged there while the customer films — this is simple and has no size
 *    ceiling beyond the volume itself.
 *  - `supabase` puts them in a private bucket, which survives the server being
 *    rebuilt and serves playback directly. But the project's plan caps how big
 *    one object can be: 50 MB on the free plan, which is under three minutes
 *    of a phone recording.
 */
export function storageChoice(): StorageChoice {
  const configured = process.env.VIDEO_STORAGE?.trim().toLowerCase();

  if (configured === "local") return "local";
  if (configured === "supabase") return "supabase";

  // Unset: keep the original behaviour so an existing deployment does not
  // silently move its videos somewhere new on the next release.
  return isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local";
}

export function getStorage(): VideoStorage {
  if (storage) return storage;

  if (storageChoice() === "supabase") {
    const { supabaseStorage } = require("./supabase") as typeof import("./supabase");
    storage = supabaseStorage;
  } else {
    storage = localStorage;
  }

  return storage;
}

/** Only for tests that need to swap the backend out. */
export function setStorage(next: VideoStorage | null): void {
  storage = next;
}

export type { VideoStorage, ResolvedVideo } from "./driver";
