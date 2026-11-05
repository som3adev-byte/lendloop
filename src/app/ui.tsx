"use client";
import { ConvexError } from "convex/values";
import { useState } from "react";

/** Wraps a mutation call so its error shows inline instead of vanishing. */
export function useRun() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, error, busy };
}

// Convex hides server error text in production unless it's a ConvexError; in dev it's
// "[CONVEX M(...)] Uncaught Error: <msg>". Show only the message part.
function message(e: unknown): string {
  if (e instanceof ConvexError) return String(e.data);
  const raw = e instanceof Error ? e.message : String(e);
  return raw.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? "Something went wrong";
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="error" role="alert">{error}</p> : null;
}

export function Status({ status, overdue }: { status: string; overdue?: boolean }) {
  return <span className={`status ${overdue ? "overdue" : status}`}>{overdue ? "overdue" : status}</span>;
}

const labels: Record<string, string> = {
  notify_sent: "Notification sent",
  notify_failed: "Notification failed",
  reminder_sent: "Reminder sent",
  automation_error: "Automation error",
};

export function timeAgo(ms: number, now = Date.now()): string {
  const m = Math.round((now - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function Activity({ items }: { items: { kind: string; at: number; detail?: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="activity">
      {items.map((a, i) => (
        <li key={i} className={a.kind.includes("fail") || a.kind.includes("error") ? "bad" : ""}>
          {labels[a.kind] ?? a.kind} {timeAgo(a.at)}
          {a.kind !== "notify_sent" && a.detail ? ` · ${a.detail}` : ""}
        </li>
      ))}
    </ul>
  );
}
