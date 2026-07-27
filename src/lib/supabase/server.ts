import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const VIDEO_BUCKET = process.env.SUPABASE_VIDEO_BUCKET || "survey-videos";

function requireUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  return url;
}

/**
 * Service-role client: bypasses row-level security.
 *
 * Used for the two things that legitimately have no logged-in user — the
 * public capture link, where the unguessable token is the credential, and
 * serving a stored video to an already-authorised request. Never hand this
 * client, or anything derived from it, to the browser.
 */
export function serviceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. It is required for capture links and video storage.",
    );
  }

  return createClient(requireUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Request-scoped client carrying the signed-in user's session, so every query
 * runs under row-level security and a surveyor can only ever read their own
 * company's work.
 */
export async function userClient() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");

  const store = await cookies();

  return createServerClient(requireUrl(), key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

export async function currentUser() {
  const client = await userClient();
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

/** The company the signed-in user belongs to; every survey is scoped to it. */
export async function currentCompanyId(): Promise<string | null> {
  const client = await userClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;

  const { data } = await client.from("profiles").select("company_id").eq("id", auth.user.id).single();
  return data?.company_id ?? null;
}
