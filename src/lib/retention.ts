/**
 * How long survey videos are kept.
 *
 * One number, read in one place, so the privacy notice the customer agrees to
 * and the job that actually deletes the footage can never drift apart. A
 * notice promising ninety days while the purge runs at thirty is worse than
 * having no notice at all.
 */

/** Deliberately conservative: long enough to quote and deliver a move, no longer. */
export const DEFAULT_RETENTION_DAYS = 90;

export function retentionDays(): number {
  const raw = process.env.VIDEO_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;

  const parsed = Number(raw);
  // A misconfigured value must not silently mean "delete everything" or
  // "keep forever" — fall back to the documented default instead.
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RETENTION_DAYS;
  return Math.floor(parsed);
}

/** Anything recorded before this is past its retention window. */
export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - retentionDays() * 24 * 60 * 60 * 1000);
}

/** "90 days" / "3 months" — for the customer-facing notice. */
export function retentionDescription(days: number = retentionDays()): string {
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "1 year" : `${years} years`;
  }
  if (days % 30 === 0 && days >= 60) return `${days / 30} months`;
  return days === 1 ? "1 day" : `${days} days`;
}
