import { DiagnosticsClient } from "./DiagnosticsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Device check",
};

/**
 * Public, like the rest of /capture — the phone being tested is usually the
 * customer's, and it has no account. Nothing here reads or writes a survey.
 */
export default function DiagnosticsPage() {
  return <DiagnosticsClient />;
}
