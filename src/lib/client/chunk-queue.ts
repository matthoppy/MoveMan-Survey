"use client";

/**
 * Keeps the pieces of a live recording in order, and keeps them at all.
 *
 * A customer walking round a house on a phone loses signal constantly — behind
 * the boiler cupboard, in the loft, halfway down the garden. The recorder does
 * not care and keeps producing a chunk every five seconds regardless. Whatever
 * catches those chunks has to hold on to the ones it cannot send yet, and send
 * them in the order they were recorded once it can: the server appends each
 * one to the same file, so a chunk that arrives out of order or not at all
 * does not produce a shorter video, it produces a corrupt one.
 *
 * The failure this exists to prevent is the quiet kind. An upload that throws
 * and is simply logged leaves a video with a hole in the middle that nobody
 * notices until a surveyor tries to watch it a day later, by which point the
 * customer has put their house back together.
 */

export interface ChunkQueueState {
  /** Chunks recorded but not yet accepted by the server. */
  pending: number;
  /** How much is being held in memory waiting for the network. */
  bufferedBytes: number;
  /** Chunks the server has taken. */
  sent: number;
  /** True while the head of the queue is failing to send. */
  struggling: boolean;
  /**
   * The queue is holding more than it is willing to. Nothing has been thrown
   * away — the recording cannot survive a missing chunk, so the only honest
   * response is to stop and say so.
   */
  overflowed: boolean;
}

export interface ChunkQueueOptions {
  /**
   * Sends one chunk. Returns the server's id for the recording, which the
   * first successful chunk establishes and the rest append to.
   */
  send: (blob: Blob, videoId: string | null) => Promise<string>;
  /** Attempts per chunk before the queue backs off and waits for the next push. */
  maxAttempts?: number;
  /** Delay before attempt n (1-based). Defaults to 1s, 2s, 4s… capped at 15s. */
  backoffMs?: (attempt: number) => number;
  /** Stop accepting beyond this much buffered data. Default 96 MB. */
  maxBufferedBytes?: number;
  onState?: (state: ChunkQueueState) => void;
  /** Injectable for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 4;

/**
 * Roughly ten minutes of outage at the recorder's bitrate.
 *
 * Generous, because the alternative to buffering is losing the survey, and a
 * phone that can record video has the memory to hold this. Not unbounded,
 * because a tab that grows without limit gets killed by the OS and takes the
 * recording with it — which is the thing we are trying to avoid.
 */
const DEFAULT_MAX_BUFFERED_BYTES = 96 * 1024 * 1024;

function defaultBackoff(attempt: number): number {
  return Math.min(15_000, 1000 * 2 ** (attempt - 1));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ChunkQueue {
  private readonly queue: Blob[] = [];
  private readonly options: Required<Omit<ChunkQueueOptions, "onState">> &
    Pick<ChunkQueueOptions, "onState">;

  private videoId: string | null = null;
  /**
   * Every drain is chained onto this rather than guarded by a boolean.
   *
   * A flag would let `flush()` return while a drain kicked off by the last
   * chunk was still running, and report an empty queue as "could not be sent"
   * — or worse, report success while chunks were still in the air.
   */
  private chain: Promise<void> = Promise.resolve();
  private sent = 0;
  private struggling = false;
  private overflowed = false;
  /** Set when a chunk fails for a reason retrying cannot fix. */
  private fatal: Error | null = null;

  constructor(options: ChunkQueueOptions) {
    this.options = {
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      backoffMs: options.backoffMs ?? defaultBackoff,
      maxBufferedBytes: options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES,
      sleep: options.sleep ?? defaultSleep,
      send: options.send,
      onState: options.onState,
    };
  }

  get state(): ChunkQueueState {
    return {
      pending: this.queue.length,
      bufferedBytes: this.queue.reduce((total, blob) => total + blob.size, 0),
      sent: this.sent,
      struggling: this.struggling,
      overflowed: this.overflowed,
    };
  }

  /** The server's id for this recording, once the first chunk has landed. */
  get recordingId(): string | null {
    return this.videoId;
  }

  /**
   * Takes a chunk off the recorder. Never rejects — the recorder's
   * `ondataavailable` is not a place errors can be handled, and a rejection
   * there would be an unhandled promise while the customer is still filming.
   */
  push(blob: Blob): void {
    if (blob.size === 0) return;

    if (this.state.bufferedBytes + blob.size > this.options.maxBufferedBytes) {
      // Deliberately keeps the chunk rather than dropping it. Dropping would
      // let recording continue over a file that is already broken.
      this.overflowed = true;
      this.emit();
      return;
    }

    this.queue.push(blob);
    this.emit();
    void this.drain();
  }

  /**
   * Sends everything still queued and resolves once the server has it all.
   *
   * Called when the customer taps "finish", where — unlike mid-recording —
   * there is a person waiting and a reason to keep trying for longer.
   */
  async flush(extraAttempts = 6): Promise<void> {
    await this.drain(this.options.maxAttempts + extraAttempts);

    if (this.fatal) throw this.fatal;
    if (this.queue.length > 0) {
      throw new Error(
        `${this.queue.length} part(s) of the recording could not be sent. ` +
          `Stay on this page while your connection comes back.`,
      );
    }
  }

  private drain(maxAttempts = this.options.maxAttempts): Promise<void> {
    this.chain = this.chain.then(() => this.drainOnce(maxAttempts));
    return this.chain;
  }

  private async drainOnce(maxAttempts: number): Promise<void> {
    if (this.fatal) return;

    while (this.queue.length > 0) {
      // Peeked, not shifted: a chunk stays at the head until the server has
      // actually taken it, so a failure can never reorder what follows.
      const blob = this.queue[0];
      const ok = await this.sendWithRetries(blob, maxAttempts);
      if (!ok) break;

      this.queue.shift();
      this.sent++;
      this.struggling = false;
      this.emit();
    }
  }

  private async sendWithRetries(blob: Blob, maxAttempts: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.videoId = await this.options.send(blob, this.videoId);
        return true;
      } catch (err) {
        if (!isRetryable(err)) {
          // Retrying will not help. Record it so flush() reports the real
          // reason rather than a generic "could not be sent".
          this.fatal = err instanceof Error ? err : new Error(String(err));
          this.struggling = true;
          this.emit();
          return false;
        }

        this.struggling = true;
        this.emit();

        if (attempt < maxAttempts) {
          await this.options.sleep(this.options.backoffMs(attempt));
        }
      }
    }

    // Out of attempts for now. The chunk stays queued and the next push — or
    // flush — tries again, which quietly gives the network longer to return.
    return false;
  }

  private emit(): void {
    this.options.onState?.(this.state);
  }
}

function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "retryable" in err) {
    return Boolean((err as { retryable: unknown }).retryable);
  }
  // An error that does not say otherwise is assumed transient. Trying again
  // costs a few seconds; giving up costs the survey.
  return true;
}
