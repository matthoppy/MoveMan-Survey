import { estimateSurvey } from "./estimate";
import { getRateCard, listVideos } from "./db";
import { DEFAULT_RATE_CARD, priceSurvey } from "./pricing";
import type { Quote } from "./pricing/types";
import type { SurveyEstimate, SurveyRecord, VideoRecord } from "./types";

export interface SurveyView extends SurveyRecord {
  estimate: SurveyEstimate;
  videos: VideoRecord[];
  quote: Quote;
  /**
   * False when the company has never entered its rates, so the quote on screen
   * came from example figures. The workspace says so loudly — a price nobody
   * set is more dangerous than no price at all.
   */
  ratesConfigured: boolean;
}

/**
 * Attach the derived estimate and price to a stored survey.
 *
 * Neither is ever persisted — both are recomputed from the inventory on every
 * read, so correcting an item moves the quote immediately and there is no
 * stale copy to go out of step. It also means a rate change reprices every
 * open survey without anything having to be rebuilt.
 */
export async function withSurveyEstimate(survey: SurveyRecord): Promise<SurveyView> {
  const estimate = estimateSurvey({
    items: survey.items,
    rooms: survey.rooms,
    origin: survey.origin,
    destination: survey.destination,
    journey: survey.journey,
    packingDayBefore: survey.packingDayBefore,
  });

  const rateCard = await getRateCard().catch(() => null);

  return {
    ...survey,
    videos: await listVideos(survey.id),
    estimate,
    quote: priceSurvey(estimate, survey.journey, rateCard ?? DEFAULT_RATE_CARD),
    ratesConfigured: rateCard !== null,
  };
}
