"use client";

/**
 * Keeps the screen awake while the customer films.
 *
 * A phone that sleeps mid-walkthrough stops MediaRecorder, and the customer
 * has to start again. The lock is dropped by the browser whenever the page is
 * hidden, so it has to be re-taken when they come back — otherwise the second
 * half of a survey records with no protection at all.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

function getWakeLock(): WakeLockLike | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
  return nav.wakeLock ?? null;
}

export function isWakeLockSupported(): boolean {
  return getWakeLock() !== null;
}

export interface WakeLockHandle {
  release(): void;
}

export function keepScreenAwake(): WakeLockHandle {
  const wakeLock = getWakeLock();
  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;

  const acquire = async () => {
    if (released || !wakeLock || document.visibilityState !== "visible") return;
    try {
      sentinel = await wakeLock.request("screen");
    } catch {
      // Denied or unsupported — recording still works, the screen may just dim.
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void acquire();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  void acquire();

  return {
    release() {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    },
  };
}
