"use client";

export function SignOutButton() {
  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button className="btn btn-sm" onClick={signOut}>
      Sign out
    </button>
  );
}
