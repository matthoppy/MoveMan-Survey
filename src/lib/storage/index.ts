import { isSupabaseConfigured } from "../db";
import { localStorage } from "./local";
import type { VideoStorage } from "./driver";

let storage: VideoStorage | null = null;

export function getStorage(): VideoStorage {
  if (storage) return storage;

  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseStorage } = require("./supabase") as typeof import("./supabase");
    storage = supabaseStorage;
  } else {
    storage = localStorage;
  }

  return storage;
}

export type { VideoStorage, ResolvedVideo } from "./driver";
