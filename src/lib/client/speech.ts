"use client";

/**
 * Thin wrapper over the browser's speech recognition.
 *
 * The customer narrating the walkthrough is the most useful signal in the
 * whole survey — it is what tells us an item is staying behind, or that they
 * want the kitchen packed. Capturing it live costs nothing and means the
 * analysis has words to work with even when the picture is poor.
 *
 * Support is not universal (Chrome and Safari yes, Firefox no), so every
 * caller has to cope with this returning null.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getConstructor() !== null;
}

export interface TranscriberHandle {
  stop(): void;
}

export function startTranscribing(opts: {
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
  lang?: string;
}): TranscriberHandle | null {
  const Ctor = getConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = opts.lang ?? "en-GB";

  let stopped = false;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) opts.onFinal(text.trim());
      else interim += text;
    }
    if (interim) opts.onInterim?.(interim.trim());
  };

  recognition.onerror = (event) => {
    // "no-speech" and "aborted" fire routinely as someone walks between rooms;
    // they are not worth showing to the customer.
    if (event.error !== "no-speech" && event.error !== "aborted") {
      opts.onError?.(event.error);
    }
  };

  // Browsers stop recognition on their own after a pause. Restart it until
  // the caller says otherwise, or the transcript dies halfway round the house.
  recognition.onend = () => {
    if (!stopped) {
      try {
        recognition.start();
      } catch {
        /* already restarting */
      }
    }
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop() {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}
