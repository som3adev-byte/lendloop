/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { sign } from "./lib/hmac";
import { checkRange, today } from "./lib/rules";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-inbound-secret";
const day = (n: number) => today(Date.now() + n * 86_400_000);

beforeEach(() => {
  vi.useFakeTimers();
  process.env.N8N_TO_CONVEX_SECRET = SECRET;
  delete process.env.N8N_NOTIFY_URL;
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const ann = t.withIdentity({ subject: "ann", name: "Ann", email: "ann@example.com" });
  const bob = t.withIdentity({ subject: "bob", name: "Bob", email: "bob@example.com" });
  const eve = t.withIdentity({ subject: "eve", name: "Eve", email: "eve@example.com" });
  for (const u of [ann, bob, eve]) await u.mutation(api.users.store, {});
  const drill = await ann.mutation(api.tools.create, {
    name: "Cordless drill", category: "Power tools", condition: "good", description: "Two batteries",
  });
  return { t, ann, bob, eve, drill };
}

async function post(t: ReturnType<typeof convexTest>, path: string, body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  return t.fetch(path, {
    method: "POST",
    headers: { "x-lendloop-timestamp": ts, "x-lendloop-signature": await sign(secret, ts, raw) },
    body: raw,
  });
}

describe("visibility", () => {
  test("public list shows name and category only", async () => {
    const { t } = await setup();
    expect(await t.query(api.tools.publicList, {})).toEqual([
      { _id: expect.any(String), name: "Cordless drill", category: "Power tools" },
    ]);
  });

  test("signed-out callers can't read the member list", async () => {
    const { t } = await setup();
    await expect(t.query(api.tools.list, {})).rejects.toThrow("Not signed in");
  });
});

describe("RBAC is enforced in Convex", () => {
  test("users can't edit or remove someone else's tool", async () => {
    const { bob, drill } = await setup();
    await expect(
      bob.mutation(api.tools.update, { toolId: drill, name: "Mine now", category: "x", condition: "good", description: "" }),
    ).rejects.toThrow("Not your tool");
    await expect(bob.mutation(api.tools.remove, { toolId: drill })).rejects.toThrow("Not your tool");
  });

  test("owner can't borrow their own tool", async () => {
    const { ann, drill } = await setup();
    await expect(
      ann.mutation(api.loans.request, { toolId: drill, startDate: day(1), endDate: day(2) }),
    ).rejects.toThrow("own tool");
  });

  test("only the owner approves; only the borrower cancels; strangers do neither", async () => {
    const { ann, bob, eve, drill } = await setup();
    const loan = await bob.mutation(api.loans.request, { toolId: drill, startDate: day(1), endDate: day(3) });
    await expect(bob.mutation(api.loans.setStatus, { loanId: loan, to: "approved" })).rejects.toThrow("Not allowed");
    await expect(eve.mutation(api.loans.setStatus, { loanId: loan, to: "approved" })).rejects.toThrow("Not allowed");
    await expect(ann.mutation(api.loans.setStatus, { loanId: loan, to: "cancelled" })).rejects.toThrow("Not allowed");
    await ann.mutation(api.loans.setStatus, { loanId: loan, to: "approved" });
    await expect(ann.mutation(api.loans.setStatus, { loanId: loan, to: "declined" })).rejects.toThrow("Can't change");
  });

  test("admin-only functions reject normal users and work for admins", async () => {
    const { t, ann, bob, drill } = await setup();
    const bobId = (await bob.query(api.users.me, {}))!._id;
    await expect(bob.mutation(api.tools.adminRemove, { toolId: drill })).rejects.toThrow("Admins only");
    await expect(bob.mutation(api.users.setTrusted, { userId: bobId, trusted: true })).rejects.toThrow("Admins only");
    await expect(bob.query(api.loans.all, {})).rejects.toThrow("Admins only");

    await t.mutation(internal.users.setRole, { email: "ann@example.com", role: "admin" });
    await ann.mutation(api.users.setTrusted, { userId: bobId, trusted: true });
    await ann.mutation(api.tools.adminRemove, { toolId: drill });
    expect(await t.query(api.tools.publicList, {})).toEqual([]);
  });

  test("a user can't promote themselves by calling store again", async () => {
    const { bob } = await setup();
    await bob.mutation(api.users.store, {});
    expect((await bob.query(api.users.me, {}))!.role).toBe("user");
  });
});

describe("booking rules", () => {
  test("overlapping dates can't both be approved", async () => {
    const { ann, bob, eve, drill } = await setup();
    const a = await bob.mutation(api.loans.request, { toolId: drill, startDate: day(1), endDate: day(4) });
    const b = await eve.mutation(api.loans.request, { toolId: drill, startDate: day(3), endDate: day(5) });
    await ann.mutation(api.loans.setStatus, { loanId: a, to: "approved" });
    await expect(ann.mutation(api.loans.setStatus, { loanId: b, to: "approved" })).rejects.toThrow("overlaps");
    await expect(
      eve.mutation(api.loans.request, { toolId: drill, startDate: day(2), endDate: day(2) }),
    ).rejects.toThrow("Already booked");
  });

  test("date validation", () => {
    expect(checkRange({ startDate: day(-1), endDate: day(1) })).toMatch("past");
    expect(checkRange({ startDate: day(3), endDate: day(1) })).toMatch("before");
    expect(checkRange({ startDate: day(1), endDate: day(40) })).toMatch("30 days");
    expect(checkRange({ startDate: "2026-1-1", endDate: day(1) })).toMatch("YYYY");
    expect(checkRange({ startDate: day(0), endDate: day(2) })).toBeNull();
  });
});

describe("automation endpoints", () => {
  async function overdueLoan() {
    const s = await setup();
    const loanId = await s.t.run(async (ctx) => {
      const tool = (await ctx.db.get(s.drill))!;
      const borrower = (await ctx.db.query("users").collect()).find((u) => u.name === "Bob")!;
      return ctx.db.insert("loans", {
        toolId: tool._id, ownerId: tool.ownerId, borrowerId: borrower._id,
        startDate: day(-5), endDate: day(-2), status: "approved",
      });
    });
    return { ...s, loanId };
  }

  test("unsigned, wrongly signed and stale requests are rejected", async () => {
    const { t } = await setup();
    expect((await t.fetch("/automation/overdue", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await post(t, "/automation/overdue", {}, "wrong-secret")).status).toBe(401);
    const ts = String(Date.now() - 10 * 60 * 1000);
    const res = await t.fetch("/automation/overdue", {
      method: "POST",
      headers: { "x-lendloop-timestamp": ts, "x-lendloop-signature": await sign(SECRET, ts, "{}") },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  test("overdue feed lists minimal fields, and reminder write-back is idempotent", async () => {
    const { t, loanId } = await overdueLoan();
    const feed = await (await post(t, "/automation/overdue", {})).json();
    expect(feed.loans).toEqual([
      { loanId, tool: "Cordless drill", endDate: day(-2), daysOverdue: 2, borrower: { name: "Bob", email: "bob@example.com" } },
    ]);

    const first = await (await post(t, "/automation/reminders", { loanId, date: feed.date, channel: "email" })).json();
    const again = await (await post(t, "/automation/reminders", { loanId, date: feed.date, channel: "email" })).json();
    expect(first).toEqual({ ok: true, duplicate: false });
    expect(again).toEqual({ ok: true, duplicate: true });

    // Reminded today, so the next run skips it.
    expect((await (await post(t, "/automation/overdue", {})).json()).loans).toEqual([]);
  });

  test("bad loan id is a 400, not a crash", async () => {
    const { t } = await setup();
    expect((await post(t, "/automation/reminders", { loanId: "nope", date: day(0) })).status).toBe(400);
  });

  test("a notification that can't be delivered is recorded, not dropped", async () => {
    const { t, ann, bob, drill } = await setup();
    await bob.mutation(api.loans.request, { toolId: drill, startDate: day(1), endDate: day(2) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [loan] = await ann.query(api.loans.incoming, {});
    expect(loan.activity[0]).toMatchObject({ kind: "notify_failed", detail: "Automation not configured" });
  });
});
