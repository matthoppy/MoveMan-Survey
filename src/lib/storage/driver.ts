/**
 * Where survey videos live.
 *
 * Both drivers stage incoming chunks on local disk while a recording is still
 * running — that is what makes a customer's flat battery survivable — and
 * differ only in what happens when the recording finishes.
 */
export interface VideoStorage {
  readonly name: "local" | "supabase";

  /** Append a chunk to a recording in progress. */
  writeChunk(
    filename: string,
    body: ReadableStream<Uint8Array> | null,
    append: boolean,
  ): Promise<WriteResult>;

  /** Called once the recording is complete. Returns the final size in bytes. */
  finalize(filename: string, mimeType: string): Promise<number>;

  /** How to serve the file to a browser. */
  resolve(filename: string, mimeType: string): Promise<ResolvedVideo>;

  remove(filename: string): Promise<void>;
}

export interface WriteResult {
  /** Size of the staged recording after this write. */
  totalBytes: number;
  /**
   * Bytes taken from *this* request.
   *
   * Reported separately so the caller can check it against Content-Length. A
   * request body can end early — a proxy, a framework limit, a dropped
   * connection — and a stream that ends early ends *cleanly*, so nothing
   * throws and the short file looks like a complete one.
   */
  writtenBytes: number;
}

export type ResolvedVideo =
  | { kind: "missing" }
  /** Served from this process, with range support handled by the route. */
  | { kind: "local"; path: string; sizeBytes: number }
  /** Hand the browser a short-lived signed URL and let object storage serve it. */
  | { kind: "redirect"; url: string };
