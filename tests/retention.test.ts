import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RETENTION_DAYS,
  retentionCutoff,
  retentionDays,
  retentionDescription,
} from "../src/lib/retention.ts";

afterEach(() => {
  delete process.env.VIDEO_RETENTION_DAYS;
});

test("unset retention falls back to the documented default", () => {
  assert.equal(retentionDays(), DEFAULT_RETENTION_DAYS);
});

test("a configured window is honoured", () => {
  process.env.VIDEO_RETENTION_DAYS = "30";
  assert.equal(retentionDays(), 30);
});

test("a nonsense window never means delete-everything or keep-forever", () => {
  // The two failure modes that matter: "0" would purge every video on the next
  // run, and a non-numeric value producing NaN would make the cutoff Invalid
  // Date, which compares false against everything and silently purges nothing.
  for (const bad of ["0", "-5", "", "soon", "NaN"]) {
    process.env.VIDEO_RETENTION_DAYS = bad;
    assert.equal(retentionDays(), DEFAULT_RETENTION_DAYS, `${bad} should fall back`);
  }
});

test("fractional days are floored rather than producing a fractional cutoff", () => {
  process.env.VIDEO_RETENTION_DAYS = "7.9";
  assert.equal(retentionDays(), 7);
});

test("the cutoff is the retention window back from now", () => {
  process.env.VIDEO_RETENTION_DAYS = "10";
  const now = new Date("2026-07-28T12:00:00.000Z");
  assert.equal(retentionCutoff(now).toISOString(), "2026-07-18T12:00:00.000Z");
});

test("a video recorded inside the window is not past the cutoff", () => {
  process.env.VIDEO_RETENTION_DAYS = "90";
  const now = new Date("2026-07-28T12:00:00.000Z");
  const cutoff = retentionCutoff(now);

  assert.equal(new Date("2026-07-01T00:00:00.000Z") > cutoff, true, "recent video kept");
  assert.equal(new Date("2026-01-01T00:00:00.000Z") < cutoff, true, "old video purged");
});

test("the notice describes the window the way a person would say it", () => {
  // The customer-facing wording is generated from the same number the purge
  // uses, so the notice cannot promise one thing while the job does another.
  assert.equal(retentionDescription(90), "3 months");
  assert.equal(retentionDescription(30), "30 days");
  assert.equal(retentionDescription(365), "1 year");
  assert.equal(retentionDescription(730), "2 years");
  assert.equal(retentionDescription(1), "1 day");
  assert.equal(retentionDescription(45), "45 days");
});
