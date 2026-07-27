import type { SurveyStatus } from "./types";

/**
 * Dates are rendered in a fixed zone rather than the viewer's. The server and
 * the browser must agree character-for-character or React tears the markup
 * down on hydration, and a removals firm works to one local clock anyway.
 */
const TIME_ZONE = "Europe/London";

export function formatCuFt(n: number): string {
  return `${Math.round(n).toLocaleString("en-GB")} cu ft`;
}

export function formatHours(n: number): string {
  const hours = Math.floor(n);
  const minutes = Math.round((n - hours) * 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
}

export const STATUS_LABEL: Record<SurveyStatus, string> = {
  awaiting_video: "Awaiting video",
  video_received: "Video received",
  analysing: "Analysing",
  analysed: "Analysed",
  quoted: "Quoted",
  failed: "Analysis failed",
};

export const STATUS_CLASS: Record<SurveyStatus, string> = {
  awaiting_video: "badge-neutral",
  video_received: "badge-accent",
  analysing: "badge-accent",
  analysed: "badge-success",
  quoted: "badge-success",
  failed: "badge-danger",
};
