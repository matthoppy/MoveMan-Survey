import { NextResponse } from "next/server";
import { z } from "zod";
import { userClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Accounts are not configured on this installation." }, { status: 501 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter an email address and password." }, { status: 400 });
  }

  const client = await userClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately vague: distinguishing "no such account" from "wrong
    // password" tells an attacker which addresses are worth guessing at.
    return NextResponse.json({ error: "Those details weren't recognised." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
