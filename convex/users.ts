import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentUser, requireAdmin } from "./lib/auth";

/** Called by the client after sign-in. Creates or refreshes the user row; never touches role. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in");
    const name = (identity.givenName ?? identity.name ?? "Neighbour").slice(0, 60);
    const existing = await currentUser(ctx);
    if (existing) {
      if (existing.name !== name || existing.email !== identity.email)
        await ctx.db.patch(existing._id, { name, email: identity.email });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email: identity.email,
      role: "user",
      trusted: false,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const u = await currentUser(ctx);
    return u && { _id: u._id, name: u.name, role: u.role, trusted: u.trusted };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({ _id: u._id, name: u.name, role: u.role, trusted: u.trusted }));
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(userId))) throw new ConvexError("User not found");
    await ctx.db.patch(userId, { trusted });
  },
});

/** Ops only, from the CLI: npx convex run users:setRole '{"email":"a@b.c","role":"admin"}' */
export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, { email, role }) => {
    const user = (await ctx.db.query("users").collect()).find((u) => u.email === email);
    if (!user) throw new ConvexError("No user with that email has signed in yet");
    await ctx.db.patch(user._id, { role });
  },
});
