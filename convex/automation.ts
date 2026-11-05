// Internal functions behind the n8n integration. Not callable from the browser.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { daysBetween, today } from "./lib/rules";

const recipientFor: Record<string, "owner" | "borrower"> = {
  requested: "owner",
  cancelled: "owner",
  approved: "borrower",
  declined: "borrower",
  returned: "borrower",
};

/** The minimum n8n needs to send one message. No descriptions, no other users. */
export const notifyPayload = internalQuery({
  args: { loanId: v.id("loans"), event: v.string() },
  handler: async (ctx, { loanId, event }) => {
    const loan = await ctx.db.get(loanId);
    const side = recipientFor[event];
    if (!loan || !side) return null;
    const [tool, recipient] = await Promise.all([
      ctx.db.get(loan.toolId),
      ctx.db.get(side === "owner" ? loan.ownerId : loan.borrowerId),
    ]);
    if (!tool || !recipient) return null;
    return {
      event,
      loanId,
      tool: tool.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: { name: recipient.name, email: recipient.email ?? null },
    };
  },
});

/** Approved, past the end date, not yet reminded today. */
export const overdue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const t = today();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", t))
      .collect();
    const out = [];
    for (const l of loans) {
      const done = await ctx.db
        .query("activity")
        .withIndex("by_key", (q) => q.eq("key", `reminder:${l._id}:${t}`))
        .first();
      if (done) continue;
      const [tool, borrower] = await Promise.all([ctx.db.get(l.toolId), ctx.db.get(l.borrowerId)]);
      out.push({
        loanId: l._id,
        tool: tool?.name ?? "a tool",
        endDate: l.endDate,
        daysOverdue: daysBetween(l.endDate, t),
        borrower: { name: borrower?.name ?? "Neighbour", email: borrower?.email ?? null },
      });
    }
    return { date: t, loans: out };
  },
});

/** Idempotent: the same key twice is a no-op, so n8n retries are safe. */
export const record = internalMutation({
  args: {
    loanId: v.optional(v.id("loans")),
    key: v.string(),
    kind: v.union(
      v.literal("notify_sent"),
      v.literal("notify_failed"),
      v.literal("reminder_sent"),
      v.literal("automation_error"),
    ),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const seen = await ctx.db.query("activity").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (seen) return { duplicate: true };
    await ctx.db.insert("activity", { ...args, detail: args.detail?.slice(0, 300) });
    return { duplicate: false };
  },
});
