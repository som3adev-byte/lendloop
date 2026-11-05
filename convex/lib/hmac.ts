// HMAC-SHA256 over `${timestamp}.${body}`, hex encoded. Web Crypto only,
// so it runs in the Convex runtime, Node, and the test runner alike.

export const MAX_SKEW_MS = 5 * 60 * 1000;

const enc = new TextEncoder();

export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True only for a fresh timestamp and a matching signature. */
export async function verify(
  secret: string | undefined,
  timestamp: string | null,
  signature: string | null,
  body: string,
  now = Date.now(),
): Promise<boolean> {
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return false;
  return safeEqual(await sign(secret, timestamp, body), signature);
}
