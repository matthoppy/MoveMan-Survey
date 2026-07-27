import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });

  const client = await userClient();
  await client.auth.signOut();

  return NextResponse.json({ ok: true });
}
