import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/db";
import { SignOutButton } from "@/components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoveMan Survey",
  description: "Video surveys for removals companies — inventory, materials and crew from a walkthrough video.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f5fd7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <header className="app-header no-print">
          <div className="app-header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">MM</span>
              MoveMan Survey
            </Link>
            <div className="grow" />
            <Link href="/surveys/new" className="btn btn-primary btn-sm">
              New survey
            </Link>
            {isSupabaseConfigured() && <SignOutButton />}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
