import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("user")),
    trusted: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.union(
      v.literal("new"),
      v.literal("good"),
      v.literal("fair"),
      v.literal("worn"),
    ),
    description: v.string(),
    removedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_removed", ["removedAt"]),

  // Dates are ISO "YYYY-MM-DD" strings, so they compare correctly as text.
  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
  })
    .index("by_tool", ["toolId"])
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_end", ["status", "endDate"]),

  // Everything the automations did, per loan. `key` makes write-backs idempotent.
  activity: defineTable({
    loanId: v.optional(v.id("loans")),
    kind: v.union(
      v.literal("notify_sent"),
      v.literal("notify_failed"),
      v.literal("reminder_sent"),
      v.literal("automation_error"),
    ),
    key: v.string(),
    detail: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"]),
});
