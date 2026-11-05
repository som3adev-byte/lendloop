// Inbound: n8n -> Convex. Every route requires a fresh HMAC signature over the raw body.
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { verify } from "./lib/hmac";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

function signed(handler: (ctx: ActionCtx, body: Record<string, unknown>) => Promise<Response>) {
  return httpAction(async (ctx, req) => {
    const raw = await req.text();
    const ok = await verify(
      process.env.N8N_TO_CONVEX_SECRET,
      req.headers.get("x-lendloop-timestamp"),
      req.headers.get("x-lendloop-signature"),
      raw,
    );
    if (!ok) return json({ error: "bad signature" }, 401);
    let body: Record<string, unknown>;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    try {
      return await handler(ctx, body);
    } catch (e) {
      console.error("automation route failed", e);
      return json({ error: "invalid request" }, 400);
    }
  });
}

const str = (x: unknown, max = 300) => (typeof x === "string" ? x.slice(0, max) : undefined);

const http = httpRouter();

http.route({
  path: "/automation/overdue",
  method: "POST",
  handler: signed(async (ctx) => json(await ctx.runQuery(internal.automation.overdue, {}))),
});

http.route({
  path: "/automation/reminders",
  method: "POST",
  handler: signed(async (ctx, b) => {
    const loanId = str(b.loanId);
    const date = str(b.date, 10);
    if (!loanId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "loanId and date required" }, 400);
    const r = await ctx.runMutation(internal.automation.record, {
      loanId: loanId as Id<"loans">,
      key: `reminder:${loanId}:${date}`,
      kind: "reminder_sent",
      detail: str(b.channel, 40) ?? "reminder",
    });
    return json({ ok: true, ...r });
  }),
});

http.route({
  path: "/automation/errors",
  method: "POST",
  handler: signed(async (ctx, b) => {
    const execution = str(b.executionId, 60) ?? String(Date.now());
    const detail = `${str(b.workflow, 80) ?? "workflow"} / ${str(b.node, 80) ?? "node"}: ${str(b.message, 200) ?? "error"}`;
    console.error("n8n error:", detail);
    const r = await ctx.runMutation(internal.automation.record, {
      loanId: str(b.loanId) as Id<"loans"> | undefined,
      key: `error:${execution}`,
      kind: "automation_error",
      detail,
    });
    return json({ ok: true, ...r });
  }),
});

export default http;
