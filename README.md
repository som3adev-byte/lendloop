# LendLoop

A neighbourhood tool-lending board. List a drill, request a ladder for the weekend, approve or decline requests for your own tools, and get reminded when something is overdue.

**Stack:** Next.js 16 (App Router) · Clerk · Convex · n8n · TypeScript

```
Browser ──(Clerk JWT)──▶ Convex queries/mutations ──(scheduler, HMAC)──▶ n8n "Notify" webhook
                               ▲                                              │
                               │                                    mock delivery (log)
                               │
n8n "Daily overdue reminders" ─┼─(HMAC) POST /automation/overdue  ──▶ list of overdue loans
                               └─(HMAC) POST /automation/reminders ──▶ idempotent write-back
n8n "Error handler" ───────────── (HMAC) POST /automation/errors   ──▶ shown on the loan
```

## Run it locally

Needs Node 20+, Docker and a Clerk application (free; `npx clerk init` gives keyless dev keys without an account).

```bash
npm install

# 1. Convex (runs a local backend; no account needed)
npx convex dev                 # keep running; writes NEXT_PUBLIC_CONVEX_URL to .env.local

# 2. Clerk
#    - put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY in .env.local
#    - in the Clerk dashboard, activate the Convex integration (or create a JWT template named "convex")
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev

# 3. Shared secrets, one per direction
A=$(openssl rand -hex 32); B=$(openssl rand -hex 32)
npx convex env set CONVEX_TO_N8N_SECRET $A
npx convex env set N8N_TO_CONVEX_SECRET $B
npx convex env set N8N_NOTIFY_URL http://localhost:5678/webhook/lendloop-notify
printf "CONVEX_TO_N8N_SECRET=$A\nN8N_TO_CONVEX_SECRET=$B\n" > .env   # read by docker-compose

# 4. n8n
docker compose up -d
docker compose exec n8n n8n import:workflow --separate --input=/workflows
for id in lendloopNotify01 lendloopOverdue1 lendloopErrors01; do
  docker compose exec n8n n8n publish:workflow --id=$id
done
docker compose restart n8n     # http://localhost:5678

# 5. App
npm run dev                    # http://localhost:3000
npx convex run seed:demo       # optional: demo tools and one overdue loan
```

Make yourself admin after signing in once:

```bash
npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
```

Run the overdue workflow on demand: open it in n8n and press **Execute workflow** (it also runs daily at 09:00).

```bash
npm test          # 13 tests: RBAC, booking rules, signatures, idempotency, failure recording
npm run lint
```

### Environment variables

| Where | Name | Purpose |
|---|---|---|
| `.env.local` | `NEXT_PUBLIC_CONVEX_URL` | Convex client URL (written by `convex dev`) |
| `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk |
| Convex env | `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL; Convex verifies JWTs against it |
| Convex env | `N8N_NOTIFY_URL` | n8n webhook for request notifications |
| Convex env + `.env` | `CONVEX_TO_N8N_SECRET` | HMAC key for Convex → n8n |
| Convex env + `.env` | `N8N_TO_CONVEX_SECRET` | HMAC key for n8n → Convex |
| `.env` | `CONVEX_SITE_URL` | Convex HTTP actions URL as seen from Docker (default `http://host.docker.internal:3211`) |

`.env.example` lists them all. No secret appears in the code or in the exported workflow JSON.

## What's where

```
convex/
  schema.ts        users, tools, loans, activity
  lib/auth.ts      currentUser / requireUser / requireAdmin; role always read from the database
  lib/rules.ts     pure rules: date checks, overlap, allowed status transitions
  lib/hmac.ts      sign / verify (Web Crypto, constant-time compare, 5-minute window)
  tools.ts         public list, member list, CRUD, admin remove
  loans.ts         request, approve / decline / return / cancel, per-role lists
  users.ts         profile sync, trusted lender, CLI-only role change
  notify.ts        outbound webhook: signed, retried with backoff, outcome recorded
  automation.ts    internal queries/mutations used by the webhooks
  http.ts          inbound routes for n8n, all signature-checked
  seed.ts          demo data (internal, CLI only)
  lendloop.test.ts convex-test suite
n8n/               exported workflows (1-notify, 2-overdue-reminders, 3-error-handler)
src/app/           Next.js pages: public home, /tools, /listings, /requests, /incoming, /admin
```

## Roles and authorization

Every rule is enforced in Convex functions. The UI hides buttons, but it is not the security boundary.

- **Signed out:** `tools.publicList` only, which returns tool name and category and nothing else.
- **User:** create, edit and remove their own listings (`tools.update` / `tools.remove` check ownership). Request any tool except their own. Only the **owner** of a tool can approve, decline or mark returned; only the **borrower** can cancel a pending request. Every status change is checked against an explicit transition table (`lib/rules.ts`), so a declined request can't be approved later.
- **Admin:** remove any listing, see all loans, mark users as Trusted Lender. Admin is granted only through an internal mutation run from the CLI; `users.store`, which the client calls on sign-in, never sets or changes a role. A test covers a user calling it to try to promote themselves.
- Approving checks for overlapping approved loans, so a tool can't be double-booked.

The Next.js proxy (`src/proxy.ts`) redirects signed-out visitors away from member pages. That is a convenience, not a control.

## n8n integration

**1 · Notify on request change.** Every request and status change schedules `notify.send` inside the same Convex transaction, so a notification is only sent if the change committed. The action signs the body, POSTs it to the n8n webhook and:
- on success records `notify_sent` on the loan;
- on a non-2xx or network error retries with exponential backoff (2, 4, 8, 16 s; 5 attempts);
- after the last attempt records `notify_failed` with the reason, so it shows on the loan in the UI and in the Convex logs.

n8n verifies the signature over the **raw** request bytes (not a re-serialised object), rejects anything older than 5 minutes, answers 401 on failure, and skips an `idempotencyKey` it has already delivered. The key is stored only after delivery succeeds, so a failed run can be retried.

**2 · Daily overdue reminders.** At 09:00 n8n calls `POST /automation/overdue`, which returns approved loans past their end date that haven't been reminded today. It sends one reminder per loan, then writes back to `POST /automation/reminders` with `{loanId, date}`. The write-back key is `reminder:<loanId>:<date>`: a retry, or a second run on the same day, is a no-op (`duplicate: true`), and the overdue feed already excludes loans reminded today. HTTP nodes retry 3 times.

**3 · Error handler.** Workflows 1 and 2 name it as their error workflow. Any failure is posted (signed) to `POST /automation/errors` and logged in Convex. Nothing fails silently: the owner or borrower sees "Notification failed …" on the loan, and failures show in the n8n execution list.

Delivery is a mock (a log line in the execution output) so the project runs with no email provider. Swapping the "Notify recipient (mock)" and "Remind borrower (mock)" Code nodes for Send Email or Slack nodes is the only change needed.

Automation activity is shown per loan in the app, for example "Reminder sent 2 days ago".

## Security and data minimisation

- **Signed in both directions.** HMAC-SHA256 over `timestamp.body`, a separate key per direction, constant-time comparison, and a 5-minute replay window. One leaked key doesn't let an attacker forge the other direction.
- **Secrets** live only in Convex environment variables and the n8n container's environment (from a git-ignored `.env`). The exported workflows reference `$env.…`; they contain no keys. `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is set so Code nodes can read them; in production I would move them to n8n credentials (see below).
- **Minimal payloads.** n8n receives what one message needs: event, tool name, dates, the recipient's first name and email. It never gets descriptions, the other party's details, or user IDs. The public page shows tool name and category only; owner names and loan state are for signed-in members.
- **Input validation** at the boundary: Convex validators on every argument, trimmed and length-limited text, ISO date checks, no loans in the past or over 30 days. Inbound webhooks reject unsigned, stale, malformed or wrongly typed bodies with 401 or 400 and never return internal errors.
- **User-facing errors** use `ConvexError`, so production shows "Not your tool", not a stack trace.
- **Soft delete** for listings keeps loan history intact.

## What I'd change for production

- **Real delivery and consent:** an email provider with templates, an unsubscribe link and per-user notification settings. Keep sending names and emails only to the provider that needs them.
- **Secrets:** n8n credentials (encrypted at rest) or a secrets manager instead of `$env`, then turn env access in Code nodes back off. Rotate keys with a short overlap where both old and new are accepted.
- **Outbox table:** replace scheduled retries with a durable outbox row per notification, plus a dashboard of stuck items and a dead-letter view.
- **n8n:** Postgres instead of SQLite, queue mode with workers, HTTPS behind a reverse proxy, SSO on the editor, and the webhook reachable only through the proxy. Store delivered idempotency keys in Postgres rather than workflow static data.
- **Scale:** the tool list does one loan lookup per tool. Fine for a neighbourhood; past a few hundred tools I'd denormalise a `currentLoanId` on the tool and paginate.
- **Timezones:** dates are UTC calendar days. A real product would store each user's timezone and compute "overdue" in it.
- **Audit and abuse:** an audit log for admin actions, rate limits on requests, and reporting or blocking between users.
- **Observability:** structured logs with a correlation ID from mutation → action → n8n execution, alerts on `notify_failed` and `automation_error` rates, and uptime checks on the webhook.
- **CI:** lint, type-check and tests on every PR; Convex and Vercel previews per branch.
