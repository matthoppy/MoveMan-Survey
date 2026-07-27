import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // With no Supabase project there are no accounts, so there is nothing to
  // sign in to and the app runs open on the local machine.
  if (!isSupabaseConfigured()) redirect("/");

  const { next } = await searchParams;

  return (
    <main className="container-narrow">
      <div style={{ maxWidth: "380px", margin: "3rem auto 0" }}>
        <div className="card">
          <div className="card-head">
            <h2>Sign in</h2>
          </div>
          <div className="card-body">
            <LoginForm next={next ?? "/"} />
          </div>
        </div>
        <p className="hint center" style={{ marginTop: "1rem" }}>
          Customers filming a survey don&apos;t need an account — their capture link works on its own.
        </p>
      </div>
    </main>
  );
}
