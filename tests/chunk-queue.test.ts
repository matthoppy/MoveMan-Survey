import { test } from "node:test";
import assert from "node:assert/strict";

import { ChunkQueue } from "../src/lib/client/chunk-queue.ts";

/** No real waiting — the backoff schedule is asserted from what it was asked for. */
function harness(
  behaviour: (attemptNumber: number, blob: Blob) => Promise<string>,
  options: Record<string, unknown> = {},
) {
  const slept: number[] = [];
  const order: number[] = [];
  let attempts = 0;

  const queue = new ChunkQueue({
    send: async (blob) => {
      attempts++;
      const id = await behaviour(attempts, blob);
      order.push(blob.size);
      return id;
    },
    sleep: async (ms) => {
      slept.push(ms);
    },
    ...options,
  });

  return { queue, slept, order, attemptCount: () => attempts };
}

const chunk = (size: number) => new Blob([new Uint8Array(size)]);

test("chunks reach the server in the order they were recorded", async () => {
  const { queue, order } = harness(async () => "vid-1");

  queue.push(chunk(10));
  queue.push(chunk(20));
  queue.push(chunk(30));
  await queue.flush();

  assert.deepEqual(order, [10, 20, 30]);
  assert.equal(queue.state.sent, 3);
});

test("the first chunk establishes the recording id and the rest append to it", async () => {
  const seen: Array<string | null> = [];
  const queue = new ChunkQueue({
    send: async (_blob, videoId) => {
      seen.push(videoId);
      return "vid-7";
    },
    sleep: async () => {},
  });

  queue.push(chunk(1));
  await queue.flush();
  queue.push(chunk(1));
  await queue.flush();

  assert.deepEqual(seen, [null, "vid-7"]);
  assert.equal(queue.recordingId, "vid-7");
});

test("a chunk that fails is retried with a widening backoff", async () => {
  const { queue, slept } = harness(async (attempt) => {
    if (attempt < 3) throw Object.assign(new Error("network"), { retryable: true });
    return "vid-1";
  });

  queue.push(chunk(5));
  await queue.flush();

  assert.equal(queue.state.sent, 1);
  assert.deepEqual(slept, [1000, 2000]);
});

test("a chunk that will not send is kept, not skipped", async () => {
  // The whole point: the server appends chunks to one file, so sending chunk 2
  // after chunk 1 failed does not shorten the video, it corrupts it.
  const sentSizes: number[] = [];
  let failFirst = true;

  const queue = new ChunkQueue({
    send: async (blob) => {
      if (failFirst && blob.size === 10) {
        throw Object.assign(new Error("offline"), { retryable: true });
      }
      sentSizes.push(blob.size);
      return "vid-1";
    },
    maxAttempts: 2,
    sleep: async () => {},
  });

  queue.push(chunk(10));
  queue.push(chunk(20));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(sentSizes, [], "nothing may go ahead of the failed chunk");
  assert.equal(queue.state.pending, 2);
  assert.equal(queue.state.struggling, true);

  // Connection comes back; the next chunk kicks the queue and it catches up.
  failFirst = false;
  queue.push(chunk(30));
  await queue.flush();

  assert.deepEqual(sentSizes, [10, 20, 30], "order preserved across the outage");
  assert.equal(queue.state.pending, 0);
  assert.equal(queue.state.struggling, false);
});

test("the queue keeps trying across a long outage rather than giving up once", async () => {
  let online = false;
  const { queue } = harness(
    async () => {
      if (!online) throw Object.assign(new Error("offline"), { retryable: true });
      return "vid-1";
    },
    { maxAttempts: 2 },
  );

  for (let i = 0; i < 12; i++) {
    queue.push(chunk(1000));
    await new Promise((r) => setTimeout(r, 0));
  }

  assert.equal(queue.state.sent, 0);
  assert.equal(queue.state.pending, 12, "everything is still held");
  assert.equal(queue.state.bufferedBytes, 12_000);

  online = true;
  await queue.flush();
  assert.equal(queue.state.sent, 12, "the whole recording arrives once signal returns");
});

test("an error retrying cannot fix stops the queue and surfaces its own message", async () => {
  const { queue, attemptCount } = harness(async () => {
    throw Object.assign(new Error("That recording belongs to a different survey."), {
      retryable: false,
    });
  });

  queue.push(chunk(5));
  await assert.rejects(() => queue.flush(), /belongs to a different survey/);
  assert.equal(attemptCount(), 1, "a 4xx must not be hammered");
});

test("flush reports failure rather than pretending the recording is complete", async () => {
  const { queue } = harness(
    async () => {
      throw Object.assign(new Error("offline"), { retryable: true });
    },
    { maxAttempts: 1 },
  );

  queue.push(chunk(5));
  await assert.rejects(() => queue.flush(0), /could not be sent/);
  assert.equal(queue.state.pending, 1, "the data is still there to retry");
});

test("flush tries harder than the mid-recording path", async () => {
  // Someone is standing there having tapped "finish", so it is worth more
  // attempts than the background drain that runs while they are still filming.
  const { queue, slept } = harness(
    async (attempt) => {
      if (attempt < 5) throw Object.assign(new Error("offline"), { retryable: true });
      return "vid-1";
    },
    { maxAttempts: 2 },
  );

  queue.push(chunk(5));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(queue.state.sent, 0, "two attempts is not enough while still filming");

  await queue.flush(6);
  assert.equal(queue.state.sent, 1, "flush keeps going and gets it through");
  assert.equal(slept.length, 3, "one backoff during recording, two more during flush");
});

test("buffering stops at a limit instead of growing until the tab is killed", async () => {
  const { queue } = harness(
    async () => {
      throw Object.assign(new Error("offline"), { retryable: true });
    },
    { maxAttempts: 1, maxBufferedBytes: 2500 },
  );

  queue.push(chunk(1000));
  await new Promise((r) => setTimeout(r, 0));
  queue.push(chunk(1000));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(queue.state.overflowed, false);

  queue.push(chunk(1000));
  assert.equal(queue.state.overflowed, true, "the customer has to be told to stop");
  assert.equal(queue.state.pending, 2, "held chunks are never discarded to make room");
});

test("empty chunks are ignored rather than queued", async () => {
  const { queue, attemptCount } = harness(async () => "vid-1");
  queue.push(new Blob([]));
  await queue.flush();
  assert.equal(attemptCount(), 0);
});
