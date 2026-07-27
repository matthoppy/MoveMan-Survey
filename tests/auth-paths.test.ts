import { test } from "node:test";
import assert from "node:assert/strict";

import { isPublicPath } from "../src/lib/auth-paths.ts";

test("the customer capture link never needs an account", () => {
  assert.equal(isPublicPath("/capture/Ozq9i9dmSqG6cIiu5qC0Y8caP_i4CibC"), true);
  assert.equal(isPublicPath("/api/capture/Ozq9i9dm/video"), true);
  assert.equal(isPublicPath("/api/capture/Ozq9i9dm/transcript"), true);
});

test("signing in is reachable when signed out", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/api/auth/sign-in"), true);
});

test("the installable app shell is public", () => {
  assert.equal(isPublicPath("/manifest.webmanifest"), true);
  assert.equal(isPublicPath("/icon.svg"), true);
});

test("the surveyor's side is not public", () => {
  for (const path of [
    "/",
    "/surveys/new",
    "/surveys/3a7094a9-3249-4ad3-882f-67a5b40a77b3",
    "/api/surveys",
    "/api/surveys/abc",
    "/api/surveys/abc/analyse",
    "/api/surveys/abc/transcribe",
    "/api/surveys/abc/video",
    "/api/videos/abc",
  ]) {
    assert.equal(isPublicPath(path), false, `${path} must require a session`);
  }
});

test("a path that merely looks like a public one is not public", () => {
  // Guards against a prefix check that would let /captured-data through.
  assert.equal(isPublicPath("/captured-secrets"), false);
  assert.equal(isPublicPath("/api/captureer"), false);
  assert.equal(isPublicPath("/surveys/capture/1"), false);
});
