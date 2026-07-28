import type { SupabaseClient } from "@supabase/supabase-js";
import { userClient, currentCompanyId } from "../supabase/server";
import { newCaptureToken, newReference } from "../ids";
import {
  DEFAULT_ACCESS,
  DEFAULT_JOURNEY,
  type AccessDetails,
  type CaptureMode,
  type InventoryItem,
  type JourneyDetails,
  type RoomSurvey,
  type SurveyRecord,
  type SurveyStatus,
  type VideoRecord,
} from "../types";
import type { CreateSurveyInput, CreateVideoInput, DatabaseDriver, UpdateVideoInput } from "./driver";

interface SurveyRow {
  id: string;
  company_id: string | null;
  reference: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  origin_address: string;
  destination_address: string;
  move_date: string | null;
  status: string;
  capture_token: string;
  origin: AccessDetails | null;
  destination: AccessDetails | null;
  journey: JourneyDetails | null;
  packing_day_before: boolean;
  rooms: RoomSurvey[] | null;
  items: InventoryItem[] | null;
  transcript: string;
  analysis_summary: string;
  analysis_flags: string[] | null;
  analysis_model: string | null;
  analysed_at: string | null;
  consented_at: string | null;
  created_at: string;
  updated_at: string;
}

interface VideoRow {
  id: string;
  survey_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration_sec: number | null;
  mode: string;
  complete: boolean;
  created_at: string;
}

function toSurvey(row: SurveyRow): SurveyRecord {
  return {
    id: row.id,
    reference: row.reference,
    clientName: row.client_name ?? "",
    clientEmail: row.client_email ?? "",
    clientPhone: row.client_phone ?? "",
    originAddress: row.origin_address ?? "",
    destinationAddress: row.destination_address ?? "",
    moveDate: row.move_date,
    status: row.status as SurveyStatus,
    captureToken: row.capture_token,
    origin: row.origin ?? DEFAULT_ACCESS,
    destination: row.destination ?? DEFAULT_ACCESS,
    journey: row.journey ?? DEFAULT_JOURNEY,
    packingDayBefore: Boolean(row.packing_day_before),
    rooms: row.rooms ?? [],
    items: row.items ?? [],
    transcript: row.transcript ?? "",
    analysisSummary: row.analysis_summary ?? "",
    analysisFlags: row.analysis_flags ?? [],
    analysisModel: row.analysis_model,
    analysedAt: row.analysed_at,
    consentedAt: row.consented_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toVideo(row: VideoRow): VideoRecord {
  return {
    id: row.id,
    surveyId: row.survey_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSec: row.duration_sec,
    mode: row.mode as CaptureMode,
    complete: Boolean(row.complete),
    createdAt: row.created_at,
  };
}

/** Maps the app's camelCase patch onto database columns. */
const COLUMN_FOR: Record<string, string> = {
  clientName: "client_name",
  clientEmail: "client_email",
  clientPhone: "client_phone",
  originAddress: "origin_address",
  destinationAddress: "destination_address",
  moveDate: "move_date",
  status: "status",
  origin: "origin",
  destination: "destination",
  journey: "journey",
  packingDayBefore: "packing_day_before",
  rooms: "rooms",
  items: "items",
  transcript: "transcript",
  analysisSummary: "analysis_summary",
  analysisFlags: "analysis_flags",
  analysisModel: "analysis_model",
  analysedAt: "analysed_at",
  consentedAt: "consented_at",
};

/** Reads and writes on behalf of the signed-in user, under row-level security. */
async function asUser(): Promise<SupabaseClient> {
  return (await userClient()) as unknown as SupabaseClient;
}

/**
 * The public key, used for the capture link. Carries no privileges of its own —
 * everything it can do is defined by the three capture functions it is granted.
 */
async function asAnon(): Promise<SupabaseClient> {
  return (await userClient()) as unknown as SupabaseClient;
}

export const supabaseDriver: DatabaseDriver = {
  name: "supabase",

  async createSurvey(input: CreateSurveyInput): Promise<SurveyRecord> {
    const client = await asUser();
    const companyId = input.companyId ?? (await currentCompanyId());

    const { data, error } = await client
      .from("surveys")
      .insert({
        company_id: companyId,
        reference: newReference(),
        capture_token: newCaptureToken(),
        client_name: input.clientName,
        client_email: input.clientEmail ?? "",
        client_phone: input.clientPhone ?? "",
        origin_address: input.originAddress ?? "",
        destination_address: input.destinationAddress ?? "",
        move_date: input.moveDate ?? null,
        status: "awaiting_video",
        origin: input.origin ?? DEFAULT_ACCESS,
        destination: input.destination ?? DEFAULT_ACCESS,
        journey: input.journey ?? DEFAULT_JOURNEY,
        packing_day_before: input.packingDayBefore ?? false,
        rooms: [],
        items: [],
      })
      .select()
      .single();

    if (error) throw new Error(`Could not create the survey: ${error.message}`);
    return toSurvey(data as SurveyRow);
  },

  async getSurvey(id) {
    const client = await asUser();
    const { data } = await client.from("surveys").select().eq("id", id).maybeSingle();
    return data ? toSurvey(data as SurveyRow) : null;
  },

  async getSurveyByToken(token) {
    // The capture link has no session behind it. Rather than reaching for the
    // service role — which would bypass row-level security on the one route
    // anyone on the internet can hit — the token is checked inside the
    // database by a security-definer function scoped to a single survey.
    const client = await asAnon();
    const { data, error } = await client.rpc("survey_by_capture_token", { p_token: token });
    if (error) throw new Error(`Could not open that capture link: ${error.message}`);

    const row = Array.isArray(data) ? data[0] : data;
    return row ? toSurvey(row as SurveyRow) : null;
  },

  async setTranscriptByToken(token, text, append) {
    const client = await asAnon();
    const { error } = await client.rpc("capture_set_transcript", {
      p_token: token,
      p_text: text,
      p_append: append,
    });
    if (error) throw new Error(`Could not save the narration: ${error.message}`);
  },

  async recordConsentByToken(token) {
    const client = await asAnon();
    const { error } = await client.rpc("capture_record_consent", { p_token: token });
    if (error) throw new Error(`Could not record your agreement: ${error.message}`);
  },

  async upsertVideoByToken(token, input) {
    const client = await asAnon();
    const { data, error } = await client.rpc("capture_upsert_video", {
      p_token: token,
      p_video_id: input.videoId,
      p_filename: input.filename,
      p_mime_type: input.mimeType,
      p_size_bytes: input.sizeBytes,
      p_duration_sec: input.durationSec,
      p_mode: input.mode,
      p_complete: input.complete,
    });

    if (error) throw new Error(`Could not save the recording: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("The recording could not be saved.");
    return toVideo(row as VideoRow);
  },

  async getVideoByToken(token, videoId) {
    const client = await asAnon();
    const { data, error } = await client.rpc("capture_video_by_id", {
      p_token: token,
      p_video_id: videoId,
    });
    if (error) throw new Error(`Could not find that recording: ${error.message}`);

    const row = Array.isArray(data) ? data[0] : data;
    return row ? toVideo(row as VideoRow) : null;
  },

  async listSurveys() {
    const client = await asUser();
    const { data } = await client.from("surveys").select().order("created_at", { ascending: false });
    return (data ?? []).map((row) => toSurvey(row as SurveyRow));
  },

  async updateSurvey(id, patch) {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(patch)) {
      const column = COLUMN_FOR[key];
      if (column && value !== undefined) payload[column] = value;
    }

    // Capture-link writes go through the token-scoped functions above, so this
    // only ever runs for a signed-in surveyor, under row-level security.
    const client = await asUser();

    const { data, error } = await client.from("surveys").update(payload).eq("id", id).select().maybeSingle();
    if (error) throw new Error(`Could not save the survey: ${error.message}`);
    return data ? toSurvey(data as SurveyRow) : null;
  },

  async deleteSurvey(id) {
    const client = await asUser();
    const { error } = await client.from("surveys").delete().eq("id", id);
    if (error) throw new Error(`Could not delete the survey: ${error.message}`);
  },

  async createVideo(input: CreateVideoInput) {
    const client = await asUser();
    const { data, error } = await client
      .from("videos")
      .insert({
        survey_id: input.surveyId,
        filename: input.filename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        duration_sec: input.durationSec ?? null,
        mode: input.mode,
        complete: input.complete !== false,
      })
      .select()
      .single();

    if (error) throw new Error(`Could not record the video: ${error.message}`);
    return toVideo(data as VideoRow);
  },

  async getVideo(id) {
    const client = await asUser();
    const { data } = await client.from("videos").select().eq("id", id).maybeSingle();
    return data ? toVideo(data as VideoRow) : null;
  },

  async listVideos(surveyId) {
    const client = await asUser();
    const { data } = await client
      .from("videos")
      .select()
      .eq("survey_id", surveyId)
      .order("created_at", { ascending: true });
    return (data ?? []).map((row) => toVideo(row as VideoRow));
  },

  async listVideosBefore(cutoffIso) {
    // The purge runs on a schedule with nobody signed in, so row-level security
    // has no session to filter by and the user client would return an empty
    // list — silently leaving every expired video in place. This is the only
    // read in the app that uses the service role.
    const { serviceClient } = require("../supabase/server") as typeof import("../supabase/server");
    const { data, error } = await serviceClient()
      .from("videos")
      .select()
      .lt("created_at", cutoffIso)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Could not list expired videos: ${error.message}`);
    return (data ?? []).map((row) => toVideo(row as VideoRow));
  },

  async updateVideo(id, patch: UpdateVideoInput) {
    const payload: Record<string, unknown> = {};
    if (patch.sizeBytes !== undefined) payload.size_bytes = patch.sizeBytes;
    if (patch.durationSec !== undefined) payload.duration_sec = patch.durationSec;
    if (patch.complete !== undefined) payload.complete = patch.complete;
    if (Object.keys(payload).length === 0) return supabaseDriver.getVideo(id);

    const client = await asUser();
    const { data, error } = await client
      .from("videos")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Could not update the video: ${error.message}`);
    return data ? toVideo(data as VideoRow) : null;
  },

  async deleteVideo(id) {
    const client = await asUser();
    await client.from("videos").delete().eq("id", id);
  },

  async deleteVideoAsSystem(id) {
    const { serviceClient } = require("../supabase/server") as typeof import("../supabase/server");
    const { error } = await serviceClient().from("videos").delete().eq("id", id);
    if (error) throw new Error(`Could not delete the expired video: ${error.message}`);
  },
};
