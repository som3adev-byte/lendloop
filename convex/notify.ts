// Outbound: Convex -> n8n. Signed, retried with backoff, and every outcome is recorded.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { sign } from "./lib/hmac";

const MAX_ATTEMPTS = 5;

export const send = internalAction({
  args: { loanId: v.id("loans"), event: v.string(), attempt: v.number() },
  handler: async (ctx, { loanId, event, attempt }) => {
    const key = `notify:${loanId}:${event}`;
    const payload = await ctx.runQuery(internal.automation.notifyPayload, { loanId, event });
    if (!payload) return; // loan vanished; nothing to say

    const url = process.env.N8N_NOTIFY_URL;
    const secret = process.env.CONVEX_TO_N8N_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.automation.record, {
        loanId, key: `${key}:failed`, kind: "notify_failed", detail: "Automation not configured",
      });
      return;
    }

    const body = JSON.stringify({ ...payload, idempotencyKey: key });
    const ts = String(Date.now());
    let error: string;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lendloop-timestamp": ts,
          "x-lendloop-signature": await sign(secret, ts, body),
          "idempotency-key": key,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        await ctx.runMutation(internal.automation.record, {
          loanId, key, kind: "notify_sent", detail: `${payload.event} → ${payload.recipient.name}`,
        });
        return;
      }
      error = `n8n answered ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    if (attempt < MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(2 ** attempt * 1000, internal.notify.send, { loanId, event, attempt: attempt + 1 });
      console.warn(`notify ${key} attempt ${attempt} failed: ${error}; retrying`);
    } else {
      console.error(`notify ${key} gave up after ${attempt} attempts: ${error}`);
      await ctx.runMutation(internal.automation.record, {
        loanId, key: `${key}:failed`, kind: "notify_failed", detail: error,
      });
    }
  },
});
