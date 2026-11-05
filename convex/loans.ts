import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin, requireUser } from "./lib/auth";
import { checkRange, isOverdue, overlaps, transitions } from "./lib/rules";

async function withDetails(ctx: QueryCtx, loans: Doc<"loans">[]) {
  return await Promise.all(
    loans.map(async (l) => {
      const [tool, owner, borrower, activity] = await Promise.all([
        ctx.db.get(l.toolId),
        ctx.db.get(l.ownerId),
        ctx.db.get(l.borrowerId),
        ctx.db.query("activity").withIndex("by_loan", (q) => q.eq("loanId", l._id)).order("desc").take(5),
      ]);
      return {
        ...l,
        toolName: tool?.name ?? "Removed tool",
        ownerName: owner?.name ?? "Unknown",
        borrowerName: borrower?.name ?? "Unknown",
        overdue: isOverdue(l),
        activity: activity.map((a) => ({ kind: a.kind, at: a._creationTime, detail: a.detail })),
      };
    }),
  );
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removedAt) throw new ConvexError("Tool not found");
    if (tool.ownerId === me._id) throw new ConvexError("You can't borrow your own tool");
    const bad = checkRange(args);
    if (bad) throw new ConvexError(bad);

    const existing = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", tool._id)).collect();
    if (existing.some((l) => l.status === "approved" && overlaps(l, args)))
      throw new ConvexError("Already booked for those dates");
    if (existing.some((l) => l.status === "pending" && l.borrowerId === me._id && overlaps(l, args)))
      throw new ConvexError("You already asked for these dates");

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: me._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
    });
    // Scheduled inside the transaction: it only runs if the insert commits.
    await ctx.scheduler.runAfter(0, internal.notify.send, { loanId, event: "requested", attempt: 1 });
    return loanId;
  },
});

export const setStatus = mutation({
  args: {
    loanId: v.id("loans"),
    to: v.union(v.literal("approved"), v.literal("declined"), v.literal("returned"), v.literal("cancelled")),
  },
  handler: async (ctx, { loanId, to }) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new ConvexError("Request not found");

    const rule = transitions[to];
    const actor = rule.by === "owner" ? loan.ownerId : loan.borrowerId;
    if (actor !== me._id) throw new ConvexError("Not allowed");
    if (!(rule.from as readonly string[]).includes(loan.status))
      throw new ConvexError(`Can't change a ${loan.status} request to ${to}`);

    if (to === "approved") {
      const others = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", loan.toolId)).collect();
      if (others.some((l) => l._id !== loan._id && l.status === "approved" && overlaps(l, loan)))
        throw new ConvexError("Another approved loan overlaps these dates");
    }

    await ctx.db.patch(loanId, { status: to });
    await ctx.scheduler.runAfter(0, internal.notify.send, { loanId, event: to, attempt: 1 });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", me._id)).order("desc").collect();
    return await withDetails(ctx, loans);
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_owner", (q) => q.eq("ownerId", me._id)).order("desc").collect();
    return await withDetails(ctx, loans);
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await withDetails(ctx, await ctx.db.query("loans").order("desc").take(200));
  },
});
