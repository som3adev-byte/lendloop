import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireUser } from "./lib/auth";
import { clean, today } from "./lib/rules";

const condition = v.union(v.literal("new"), v.literal("good"), v.literal("fair"), v.literal("worn"));
const fields = {
  name: v.string(),
  category: v.string(),
  condition,
  description: v.string(),
};

function tidy(a: { name: string; category: string; description: string }) {
  return {
    name: clean(a.name, 80),
    category: clean(a.category, 40),
    description: a.description.trim() ? clean(a.description, 1000) : "",
  };
}

async function activeTools(ctx: QueryCtx) {
  return await ctx.db
    .query("tools")
    .withIndex("by_removed", (q) => q.eq("removedAt", undefined))
    .collect();
}

/** The approved loan covering today, if any. */
async function currentLoan(ctx: QueryCtx, toolId: Id<"tools">) {
  const t = today();
  const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
  return loans.find((l) => l.status === "approved" && l.startDate <= t) ?? null;
}

async function ownTool(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const user = await requireUser(ctx);
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt) throw new ConvexError("Tool not found");
  if (tool.ownerId !== user._id) throw new ConvexError("Not your tool");
  return tool;
}

/** Public, no sign-in: name and category only. Nothing about owners or loans. */
export const publicList = query({
  args: {},
  handler: async (ctx) => {
    const tools = await activeTools(ctx);
    const out = [];
    for (const t of tools) {
      if (!(await currentLoan(ctx, t._id))) out.push({ _id: t._id, name: t.name, category: t.category });
    }
    return out;
  },
});

// ponytail: one loan lookup per tool; fine for a neighbourhood, paginate + denormalise past a few hundred tools.
export const list = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    const me = await requireUser(ctx);
    const tools = (await activeTools(ctx)).filter((t) => !category || t.category === category);
    return await Promise.all(
      tools.map(async (t) => {
        const owner = await ctx.db.get(t.ownerId);
        const loan = await currentLoan(ctx, t._id);
        return {
          ...t,
          ownerName: owner?.name ?? "Unknown",
          ownerTrusted: owner?.trusted ?? false,
          mine: t.ownerId === me._id,
          availableFrom: loan ? loan.endDate : null,
        };
      }),
    );
  },
});

export const categories = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return [...new Set((await activeTools(ctx)).map((t) => t.category))].sort();
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const tools = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", me._id)).collect();
    return tools.filter((t) => !t.removedAt);
  },
});

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db.insert("tools", { ownerId: me._id, condition: args.condition, ...tidy(args) });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...fields },
  handler: async (ctx, { toolId, ...args }) => {
    await ownTool(ctx, toolId);
    await ctx.db.patch(toolId, { condition: args.condition, ...tidy(args) });
  },
});

/** Owner removes their listing. Soft delete keeps loan history intact. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await ownTool(ctx, toolId);
    if (await currentLoan(ctx, toolId)) throw new ConvexError("Tool is out on loan; mark it returned first");
    await ctx.db.patch(toolId, { removedAt: Date.now() });
  },
});

export const adminRemove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await requireAdmin(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    await ctx.db.patch(toolId, { removedAt: Date.now() });
  },
});
