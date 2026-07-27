/**
 * Which paths stay reachable without a session.
 *
 * The customer capture link is the one that matters. Someone filming their
 * house has no account and must never be asked for one — the unguessable
 * token in the URL is the credential, and the capture routes check it
 * themselves. Getting this wrong locks customers out of surveys silently,
 * so it lives here as a pure function with tests rather than inline in the
 * middleware.
 */
const PUBLIC_PREFIXES = [
  "/capture/",
  "/api/capture/",
  "/login",
  "/api/auth/",
  "/manifest.webmanifest",
  "/icon",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}
