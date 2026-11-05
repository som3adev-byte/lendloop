import { ConvexError } from "convex/values";
// Pure loan rules, shared by mutations and tests.

export type Range = { startDate: string; endDate: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function today(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function overlaps(a: Range, b: Range): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** Returns an error message, or null when the requested range is valid. */
export function checkRange(r: Range, now = Date.now()): string | null {
  if (!ISO.test(r.startDate) || !ISO.test(r.endDate)) return "Dates must be YYYY-MM-DD";
  if (Number.isNaN(Date.parse(r.startDate)) || Number.isNaN(Date.parse(r.endDate)))
    return "Invalid date";
  if (r.startDate < today(now)) return "Start date is in the past";
  if (r.endDate < r.startDate) return "End date is before start date";
  if (daysBetween(r.startDate, r.endDate) > 30) return "Loans are limited to 30 days";
  return null;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function isOverdue(loan: Range & { status: string }, now = Date.now()): boolean {
  return loan.status === "approved" && loan.endDate < today(now);
}

/** Allowed status changes, and who may make them. */
export const transitions = {
  approved: { from: ["pending"], by: "owner" },
  declined: { from: ["pending"], by: "owner" },
  returned: { from: ["approved"], by: "owner" },
  cancelled: { from: ["pending"], by: "borrower" },
} as const;

export type Transition = keyof typeof transitions;

export function clean(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) throw new ConvexError("Field is required");
  if (t.length > max) throw new ConvexError(`Must be ${max} characters or fewer`);
  return t;
}
