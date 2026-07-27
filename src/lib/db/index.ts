import type { DatabaseDriver } from "./driver";
import { sqliteDriver } from "./sqlite";

/**
 * The app talks to one of these; which one is decided by configuration.
 *
 * Supabase when its keys are present — Postgres, auth and row-level security,
 * which is what you want the moment more than one person uses this. Local
 * SQLite otherwise, so `npm run dev` works with no accounts to set up.
 */
let driver: DatabaseDriver | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function getDriver(): DatabaseDriver {
  if (driver) return driver;

  if (isSupabaseConfigured()) {
    // Required lazily so a local install never has to resolve the Supabase SDK.
    const { supabaseDriver } = require("./supabase") as typeof import("./supabase");
    driver = supabaseDriver;
  } else {
    driver = sqliteDriver;
  }

  return driver;
}

/** Only for tests that need to swap the backend out. */
export function setDriver(next: DatabaseDriver | null): void {
  driver = next;
}

export const createSurvey: DatabaseDriver["createSurvey"] = (input) => getDriver().createSurvey(input);
export const getSurvey: DatabaseDriver["getSurvey"] = (id) => getDriver().getSurvey(id);
export const getSurveyByToken: DatabaseDriver["getSurveyByToken"] = (token) =>
  getDriver().getSurveyByToken(token);
export const listSurveys: DatabaseDriver["listSurveys"] = () => getDriver().listSurveys();
export const updateSurvey: DatabaseDriver["updateSurvey"] = (id, patch) =>
  getDriver().updateSurvey(id, patch);
export const deleteSurvey: DatabaseDriver["deleteSurvey"] = (id) => getDriver().deleteSurvey(id);

export const setTranscriptByToken: DatabaseDriver["setTranscriptByToken"] = (token, text, append) =>
  getDriver().setTranscriptByToken(token, text, append);
export const upsertVideoByToken: DatabaseDriver["upsertVideoByToken"] = (token, input) =>
  getDriver().upsertVideoByToken(token, input);

export const getVideoByToken: DatabaseDriver["getVideoByToken"] = (token, videoId) =>
  getDriver().getVideoByToken(token, videoId);

export const createVideo: DatabaseDriver["createVideo"] = (input) => getDriver().createVideo(input);
export const getVideo: DatabaseDriver["getVideo"] = (id) => getDriver().getVideo(id);
export const listVideos: DatabaseDriver["listVideos"] = (surveyId) => getDriver().listVideos(surveyId);
export const updateVideo: DatabaseDriver["updateVideo"] = (id, patch) =>
  getDriver().updateVideo(id, patch);
export const deleteVideo: DatabaseDriver["deleteVideo"] = (id) => getDriver().deleteVideo(id);

export type { DatabaseDriver, CreateSurveyInput, CreateVideoInput, UpdateVideoInput } from "./driver";
