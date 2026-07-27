import type { SurveyRecord, VideoRecord, CaptureMode, AccessDetails, JourneyDetails } from "../types";

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
  /** Owning removals company. Ignored by the local driver, which is single-tenant. */
  companyId?: string | null;
}

export interface CreateVideoInput {
  surveyId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number | null;
  mode: CaptureMode;
  complete?: boolean;
}

export interface UpdateVideoInput {
  sizeBytes?: number;
  durationSec?: number | null;
  complete?: boolean;
}

/**
 * Everything the app needs from a database.
 *
 * Kept deliberately small and asynchronous so the local SQLite driver and the
 * Supabase driver are genuinely interchangeable — the routes and pages never
 * learn which one they are talking to.
 */
export interface DatabaseDriver {
  readonly name: "sqlite" | "supabase";

  createSurvey(input: CreateSurveyInput): Promise<SurveyRecord>;
  getSurvey(id: string): Promise<SurveyRecord | null>;
  /** Resolves the public capture link. Must bypass row-level security. */
  getSurveyByToken(token: string): Promise<SurveyRecord | null>;
  listSurveys(): Promise<SurveyRecord[]>;
  updateSurvey(id: string, patch: Partial<SurveyRecord>): Promise<SurveyRecord | null>;
  deleteSurvey(id: string): Promise<void>;

  createVideo(input: CreateVideoInput): Promise<VideoRecord>;
  getVideo(id: string): Promise<VideoRecord | null>;
  listVideos(surveyId: string): Promise<VideoRecord[]>;
  updateVideo(id: string, patch: UpdateVideoInput): Promise<VideoRecord | null>;
  deleteVideo(id: string): Promise<void>;
}
