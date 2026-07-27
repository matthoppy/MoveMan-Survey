import Database from "better-sqlite3";
import { databasePath } from "./paths";
import { newCaptureToken, newId, newReference } from "./ids";
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
} from "./types";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(databasePath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL DEFAULT '',
      client_email TEXT NOT NULL DEFAULT '',
      client_phone TEXT NOT NULL DEFAULT '',
      origin_address TEXT NOT NULL DEFAULT '',
      destination_address TEXT NOT NULL DEFAULT '',
      move_date TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_video',
      capture_token TEXT NOT NULL UNIQUE,
      origin_json TEXT NOT NULL,
      destination_json TEXT NOT NULL,
      journey_json TEXT NOT NULL,
      packing_day_before INTEGER NOT NULL DEFAULT 0,
      rooms_json TEXT NOT NULL DEFAULT '[]',
      items_json TEXT NOT NULL DEFAULT '[]',
      transcript TEXT NOT NULL DEFAULT '',
      analysis_summary TEXT NOT NULL DEFAULT '',
      analysis_flags_json TEXT NOT NULL DEFAULT '[]',
      analysis_model TEXT,
      analysed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      duration_sec REAL,
      mode TEXT NOT NULL DEFAULT 'upload',
      complete INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_videos_survey ON videos(survey_id);
    CREATE INDEX IF NOT EXISTS idx_surveys_token ON surveys(capture_token);
  `);

  return db;
}

type SurveyRow = {
  id: string;
  reference: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  origin_address: string;
  destination_address: string;
  move_date: string | null;
  status: string;
  capture_token: string;
  origin_json: string;
  destination_json: string;
  journey_json: string;
  packing_day_before: number;
  rooms_json: string;
  items_json: string;
  transcript: string;
  analysis_summary: string;
  analysis_flags_json: string;
  analysis_model: string | null;
  analysed_at: string | null;
  created_at: string;
  updated_at: string;
};

function parse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function toSurvey(row: SurveyRow): SurveyRecord {
  return {
    id: row.id,
    reference: row.reference,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    originAddress: row.origin_address,
    destinationAddress: row.destination_address,
    moveDate: row.move_date,
    status: row.status as SurveyStatus,
    captureToken: row.capture_token,
    origin: parse<AccessDetails>(row.origin_json, DEFAULT_ACCESS),
    destination: parse<AccessDetails>(row.destination_json, DEFAULT_ACCESS),
    journey: parse<JourneyDetails>(row.journey_json, DEFAULT_JOURNEY),
    packingDayBefore: row.packing_day_before === 1,
    rooms: parse<RoomSurvey[]>(row.rooms_json, []),
    items: parse<InventoryItem[]>(row.items_json, []),
    transcript: row.transcript,
    analysisSummary: row.analysis_summary,
    analysisFlags: parse<string[]>(row.analysis_flags_json, []),
    analysisModel: row.analysis_model,
    analysedAt: row.analysed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateSurveyInput {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  originAddress?: string;
  destinationAddress?: string;
  moveDate?: string | null;
  origin?: AccessDetails;
  destination?: AccessDetails;
  journey?: JourneyDetails;
  packingDayBefore?: boolean;
}

export function createSurvey(input: CreateSurveyInput): SurveyRecord {
  const now = new Date().toISOString();
  const record = {
    id: newId(),
    reference: newReference(),
    capture_token: newCaptureToken(),
  };

  getDb()
    .prepare(
      `INSERT INTO surveys (
        id, reference, client_name, client_email, client_phone,
        origin_address, destination_address, move_date, status, capture_token,
        origin_json, destination_json, journey_json, packing_day_before,
        rooms_json, items_json, transcript, analysis_summary, analysis_flags_json,
        analysis_model, analysed_at, created_at, updated_at
      ) VALUES (
        @id, @reference, @client_name, @client_email, @client_phone,
        @origin_address, @destination_address, @move_date, 'awaiting_video', @capture_token,
        @origin_json, @destination_json, @journey_json, @packing_day_before,
        '[]', '[]', '', '', '[]',
        NULL, NULL, @created_at, @updated_at
      )`,
    )
    .run({
      ...record,
      client_name: input.clientName,
      client_email: input.clientEmail ?? "",
      client_phone: input.clientPhone ?? "",
      origin_address: input.originAddress ?? "",
      destination_address: input.destinationAddress ?? "",
      move_date: input.moveDate ?? null,
      origin_json: JSON.stringify(input.origin ?? DEFAULT_ACCESS),
      destination_json: JSON.stringify(input.destination ?? DEFAULT_ACCESS),
      journey_json: JSON.stringify(input.journey ?? DEFAULT_JOURNEY),
      packing_day_before: input.packingDayBefore ? 1 : 0,
      created_at: now,
      updated_at: now,
    });

  return getSurvey(record.id)!;
}

export function getSurvey(id: string): SurveyRecord | null {
  const row = getDb().prepare("SELECT * FROM surveys WHERE id = ?").get(id) as SurveyRow | undefined;
  return row ? toSurvey(row) : null;
}

export function getSurveyByToken(token: string): SurveyRecord | null {
  const row = getDb().prepare("SELECT * FROM surveys WHERE capture_token = ?").get(token) as SurveyRow | undefined;
  return row ? toSurvey(row) : null;
}

export function listSurveys(): SurveyRecord[] {
  const rows = getDb().prepare("SELECT * FROM surveys ORDER BY created_at DESC").all() as SurveyRow[];
  return rows.map(toSurvey);
}

const COLUMN_FOR: Record<string, { column: string; encode: (v: unknown) => unknown }> = {
  clientName: { column: "client_name", encode: String },
  clientEmail: { column: "client_email", encode: String },
  clientPhone: { column: "client_phone", encode: String },
  originAddress: { column: "origin_address", encode: String },
  destinationAddress: { column: "destination_address", encode: String },
  moveDate: { column: "move_date", encode: (v) => (v == null ? null : String(v)) },
  status: { column: "status", encode: String },
  origin: { column: "origin_json", encode: (v) => JSON.stringify(v) },
  destination: { column: "destination_json", encode: (v) => JSON.stringify(v) },
  journey: { column: "journey_json", encode: (v) => JSON.stringify(v) },
  packingDayBefore: { column: "packing_day_before", encode: (v) => (v ? 1 : 0) },
  rooms: { column: "rooms_json", encode: (v) => JSON.stringify(v) },
  items: { column: "items_json", encode: (v) => JSON.stringify(v) },
  transcript: { column: "transcript", encode: String },
  analysisSummary: { column: "analysis_summary", encode: String },
  analysisFlags: { column: "analysis_flags_json", encode: (v) => JSON.stringify(v) },
  analysisModel: { column: "analysis_model", encode: (v) => (v == null ? null : String(v)) },
  analysedAt: { column: "analysed_at", encode: (v) => (v == null ? null : String(v)) },
};

export function updateSurvey(id: string, patch: Partial<SurveyRecord>): SurveyRecord | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: new Date().toISOString() };

  for (const [key, value] of Object.entries(patch)) {
    const mapping = COLUMN_FOR[key];
    if (!mapping || value === undefined) continue;
    sets.push(`${mapping.column} = @${mapping.column}`);
    params[mapping.column] = mapping.encode(value);
  }

  if (sets.length === 0) return getSurvey(id);

  getDb()
    .prepare(`UPDATE surveys SET ${sets.join(", ")}, updated_at = @updated_at WHERE id = @id`)
    .run(params);

  return getSurvey(id);
}

export function deleteSurvey(id: string): void {
  getDb().prepare("DELETE FROM surveys WHERE id = ?").run(id);
}

// ---- Videos ----

type VideoRow = {
  id: string;
  survey_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration_sec: number | null;
  mode: string;
  complete: number;
  created_at: string;
};

function toVideo(row: VideoRow): VideoRecord {
  return {
    id: row.id,
    surveyId: row.survey_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSec: row.duration_sec,
    mode: row.mode as CaptureMode,
    complete: row.complete === 1,
    createdAt: row.created_at,
  };
}

export function createVideo(input: {
  surveyId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number | null;
  mode: CaptureMode;
  complete?: boolean;
}): VideoRecord {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO videos (id, survey_id, filename, mime_type, size_bytes, duration_sec, mode, complete, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.surveyId,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.durationSec ?? null,
      input.mode,
      input.complete === false ? 0 : 1,
      new Date().toISOString(),
    );
  return getVideo(id)!;
}

export function getVideo(id: string): VideoRecord | null {
  const row = getDb().prepare("SELECT * FROM videos WHERE id = ?").get(id) as VideoRow | undefined;
  return row ? toVideo(row) : null;
}

export function listVideos(surveyId: string): VideoRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM videos WHERE survey_id = ? ORDER BY created_at ASC")
    .all(surveyId) as VideoRow[];
  return rows.map(toVideo);
}

export function updateVideo(
  id: string,
  patch: { sizeBytes?: number; durationSec?: number | null; complete?: boolean },
): VideoRecord | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (patch.sizeBytes !== undefined) {
    sets.push("size_bytes = @size_bytes");
    params.size_bytes = patch.sizeBytes;
  }
  if (patch.durationSec !== undefined) {
    sets.push("duration_sec = @duration_sec");
    params.duration_sec = patch.durationSec;
  }
  if (patch.complete !== undefined) {
    sets.push("complete = @complete");
    params.complete = patch.complete ? 1 : 0;
  }
  if (sets.length === 0) return getVideo(id);

  getDb().prepare(`UPDATE videos SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getVideo(id);
}
