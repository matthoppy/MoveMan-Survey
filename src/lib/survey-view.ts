import { estimateSurvey } from "./estimate";
import { listVideos } from "./db";
import type { SurveyEstimate, SurveyRecord, VideoRecord } from "./types";

export interface SurveyView extends SurveyRecord {
  estimate: SurveyEstimate;
  videos: VideoRecord[];
}

/**
 * Attach the derived estimate to a stored survey.
 *
 * The estimate is never persisted — it is recomputed from the inventory on
 * every read, so editing an item immediately moves the quote and there is no
 * stale copy to go out of step.
 */
export async function withSurveyEstimate(survey: SurveyRecord): Promise<SurveyView> {
  return {
    ...survey,
    videos: await listVideos(survey.id),
    estimate: estimateSurvey({
      items: survey.items,
      rooms: survey.rooms,
      origin: survey.origin,
      destination: survey.destination,
      journey: survey.journey,
      packingDayBefore: survey.packingDayBefore,
    }),
  };
}
