import { randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

/** Unguessable token for the public client capture link. */
export function newCaptureToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Human-facing job reference, e.g. MM-7K2QAX. */
export function newReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `MM-${out}`;
}
