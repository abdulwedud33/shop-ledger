# security.md

Security baseline for Shop Ledger (working title). This file is the single source of truth for security rules. Every milestone in `06-implementation-plan.md` must meet it before it is "done".

**Status:** planning. Rules apply from the first line of code.

---

## 1. What we protect

| Asset | Why it matters | Who must never see it |
|-------|----------------|-----------------------|
| Sales, stock and debt records | The shop's livelihood | Other shops, anonymous users |
| Cost prices and profit | Business-sensitive | Cashiers, other shops |
| Customer names and phone numbers | Personal data | Other shops, logs, AI provider (unless needed for a reminder) |
| Auth sessions and tokens | Account takeover | Anyone but the user |
| Service-role key, AI provider key | Full database / money access | The browser, git, logs |

## 2. Non-negotiables (the rules)

These come directly from the project requirements and are checked in CI, tests and review.

| # | Rule | Where enforced |
|---|------|----------------|
| 1 | **No secrets or keys in the frontend or inside the app.** Only the public project URL and public (anon/publishable) key may ship in the bundle. | Section 3, CI secret scan, bundle grep |
| 2 | **Users access only authorized data.** Access is decided by the server from the verified session, never by the client. | Sections 4 and 5 |
| 3 | **Backend and database rules are enforced.** UI checks are convenience only; RLS, constraints and RPC checks are the real rules. | Sections 5 and 6 |
| 4 | **All user and AI input is validated** on the client and again on the server. | Section 6, `guardrails.md` |
| 5 | **Row level security is on for every table, with policies written in the same migration.** | Section 5 |
| 6 | **Rate limiting on all APIs.** | Section 7 |
| 7 | **No backend errors shown to users.** Details go to logs only. | Section 8 |

## 3. Secrets management

**Allowed in the client bundle:** Supabase project URL, public anon/publishable key, public app config (feature flags, app version).
**Never in the client or in git:** service-role key, AI provider key, database password, JWT secret, webhook secrets, any `.env` with real values.

| Practice | Detail |
|----------|--------|
| Where secrets live | Supabase Edge Function secrets, CI secret store, hosting dashboard (build-time public vars only) |
| Local development | `.env.local` is git-ignored; a committed `.env.example` has placeholder values only |
| Scanning | `gitleaks` runs on every PR and on full history weekly |
| Bundle check | CI greps the built `out/` folder for key patterns (`service_role`, `sk-`, `eyJ` JWTs with `role":"service_role"`) and fails the build on a hit |
| AI calls | Only from Edge Functions. The browser never calls the AI provider directly |
| Service role | Used only in scheduled jobs and the rate limiter. Never used to answer a user request on user data |
| Rotation | Keys rotate on staff change, on any suspected leak, and at least every 6 months. The rotation steps are written in the runbook before launch |
| Logs | Never log tokens, keys, request bodies containing personal data, or raw prompts |

If a secret is ever committed: revoke and rotate first, then clean history. Treat it as leaked even if the repo is private.

## 4. Authentication and sessions

- Supabase Auth with email or phone sign-in. Passwords are never handled by our own code.
- Password rules: minimum 10 characters, checked against common-password lists. No composition rules that push users to weak patterns.
- Sign-in, sign-up, OTP and password-reset endpoints are rate limited (section 7). Responses do not reveal whether an account exists.
- Short-lived access token with refresh. Sign out clears local session and local cache (section 10).
- Invites: single-use, expiring link or code, role fixed at invite time, owner-only to create. Used invites are invalidated.
- Roles are stored in `shop_members`, never in client-editable JWT metadata.
- Optional later: owner MFA, and an app PIN for shared counter devices.
- Sensitive owner actions (void, stock adjustment, role change, export) are written to `audit_log`.

## 5. Authorization and row level security

**Every table has RLS enabled. A migration that adds a table without RLS and policies fails review and CI.**

Rules for policies:

1. Default deny. Start from no access and add the narrowest policy needed.
2. `anon` has no policies on any table.
3. Never `using (true)` or `with check (true)` on a table with shop data.
4. Policy checks use helper functions `is_member(shop_id)` and `is_owner(shop_id)` (see `05-backend-schema.md`). Call `auth.uid()` as `(select auth.uid())` so it is evaluated once per query.
5. Every column used in a policy (`shop_id`, `user_id`) is indexed.
6. Security-definer functions set `search_path = ''`, use fully qualified names, and re-check the caller's role inside the function.
7. Views use `security_invoker = true`.
8. Ledgers (`sales`, `sale_items`, `stock_movements`, `customer_ledger`) allow no direct writes. Inserts happen only inside RPC functions, and `UPDATE`/`DELETE` are blocked by both revoked privileges and triggers.
9. Cost and profit data lives in owner-only tables (`product_costs`, `sale_item_costs`). Cashiers cannot read them by any path, including joins and views.
10. Storage buckets (product images, exports) have their own policies scoped by `shop_id` in the object path.
11. The client never sends `shop_id` to an AI tool. The shop comes from the verified session.

**Required test matrix** (CI, blocking), for every table and actor: anonymous, authenticated outsider, cashier of shop A, owner of shop A, owner of shop B. Cross-shop reads and writes must always fail.

## 6. Input validation and output encoding

Validate on arrival, validate again on the server, constrain in the database.

| Layer | Mechanism |
|-------|-----------|
| Client | Zod schemas shared with the server (types, lengths, ranges) |
| Edge Functions | Zod parse on every request; reject unknown fields; body size limit |
| RPC functions | Argument shape, range and length checks; coded errors |
| Database | `CHECK` constraints, `NOT NULL`, foreign keys, unique keys |
| AI input and output | See `guardrails.md`. AI output is untrusted input and goes through the same validators |

Specific rules:

- **Money and quantity:** positive, bounded ranges, correct precision. Never trust a client-supplied total; the server recomputes from current prices.
- **IDs:** must be UUIDs and must belong to the caller's shop (enforced by RLS and lookups).
- **Text:** length limits, Unicode normalised, control characters stripped. Names, notes and product names are treated as **untrusted data** everywhere, including inside AI prompts.
- **XSS:** React escaping only. No `dangerouslySetInnerHTML`. Strict Content Security Policy (section 9).
- **CSV export:** cells that start with `=`, `+`, `-` or `@` are prefixed with `'` to prevent spreadsheet formula injection.
- **CSV import and file uploads (later):** size cap, type allow-list, parse in a sandboxed function, never execute or render uploaded content.
- **SQL:** parameterised queries only. No string-built SQL in functions.
- **URLs and deep links:** validate and ignore unknown parameters.

## 7. Rate limiting (all APIs)

Every endpoint has a limit. "No limit" is not allowed, including read endpoints, auth and AI.

| Surface | Limit (starting values, tune with data) | Key | Enforced by |
|---------|------------------------------------------|-----|-------------|
| Sign-in / sign-up / reset | 5 per 15 min per IP and per identifier | IP + identifier | Supabase Auth limits + CDN rule |
| OTP / invite send | 3 per hour per target, 10 per day per user | target, user | Edge Function limiter |
| Write RPCs (sale, payment, stock) | 120 per minute per user | user id | Edge/DB limiter, CDN rate rule |
| Read RPCs and list queries | 300 per minute per user, page size capped at 50 | user id | PostgREST max rows, CDN rule |
| Reports and dashboard | 30 per minute per user | user id | RPC-level limiter |
| Export | 5 per hour per shop | shop id | Edge Function limiter |
| AI endpoints | 10 per minute and 200 per day per user; token cap per shop per day | user, shop | Edge Function limiter (`guardrails.md`) |
| Anything unauthenticated | 60 per minute per IP | IP | CDN / WAF |

Implementation notes:

- Layered: CDN/WAF rules for IP-level abuse, Edge Function limiter backed by the `rate_limits` table for per-user and per-shop limits, database-level caps (max rows) as a last line.
- Limits return HTTP 429 with a `Retry-After` header. The UI shows a calm message ("Too many tries. Please wait a minute.") and the offline outbox backs off automatically.
- The sync worker uses exponential backoff with jitter so a reconnecting device never floods the API.
- Alerts fire on sustained 429 spikes and on repeated auth failures.

## 8. Error handling: never show backend errors

1. Users never see stack traces, SQL, table or column names, status codes, request ids, or raw JSON.
2. All server errors carry a short internal code (for example `STOCK_LOW`, `LIMIT_EXCEEDED`, `RATE_LIMITED`).
3. One client-side **error translation module** maps each code to a plain sentence and a next action. Unknown codes map to a generic "Something went wrong. Your work is saved on this phone. Try again." message.
4. Full details go to server logs and Sentry with a request id. No personal data in logs.
5. Auth and permission errors are generic ("You don't have access to this") and never confirm whether a record exists.
6. CI includes a failure-fuzz test that asserts no code, SQL or stack text ever appears in the DOM.

## 9. Transport and browser hardening

- HTTPS only; HSTS with preload once stable; TLS 1.2+.
- Security headers set by the static host (`_headers` file), for example:
  - `Content-Security-Policy`: `default-src 'self'`; `connect-src` limited to the project API origin; `script-src 'self'` (no inline scripts, hashes if needed); `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` limited to camera (barcode) and microphone (dictation) only where used.
- CORS on Edge Functions: allow-list of our own origins only.
- Third-party scripts: none by default. Any addition needs review and Subresource Integrity.
- Service worker: caches the app shell and static assets only. It never caches authenticated API responses; data caching is done in IndexedDB under our control.

## 10. Data on the device (offline)

The offline outbox and cache hold shop data in IndexedDB. Risks: a lost or shared phone.

- Sign out wipes the local database and the service-worker data caches.
- No tokens or keys stored outside Supabase's session storage; no secrets in IndexedDB.
- Optional app lock (PIN) for shared counter devices, planned for v1.1.
- Cost and profit data is not cached on cashier sessions (it is never returned to them).
- The app tells the user plainly what is stored on the phone and how to remove it.
- Honest limit: browser storage is not a vault. Rooted or unlocked devices can be read, so we minimise what is stored rather than rely on encryption alone.

## 11. Privacy and personal data

- Collect only what is needed: customer name and optional phone; staff email or phone for sign-in.
- Customer data belongs to the shop. Owners can export and delete it. Account deletion removes the shop's data (cascade) after a short grace window.
- AI: send the minimum fields; no phone numbers except when drafting a reminder; no cost prices outside the owner-only insights flow; provider settings must disable training on our data (verify in the provider's current terms before launch).
- Logs, analytics and error reports exclude names, phone numbers and amounts tied to a person.
- Confirm applicable local data-protection requirements with a qualified advisor before public launch; this document is an engineering baseline, not legal advice.

## 12. Supply chain and build

- Lockfile committed; `npm ci` in CI. Dependabot (or equivalent) with weekly updates.
- `npm audit` and a licence check on every PR; high severity blocks merge.
- GitHub Actions pinned to commit SHAs; least-privilege `GITHUB_TOKEN`; branch protection with required reviews and checks.
- Production migrations are applied by CI only, never from a laptop.
- Few dependencies, each justified (also protects the bundle budget).

## 13. Logging, monitoring and incident response

| Signal | Alert when |
|--------|-----------|
| Auth failures | Spike per IP or per account |
| 429 responses | Sustained spike |
| RPC error rate | Above baseline |
| Invariant job (stock, balances) | Any mismatch |
| AI cost per shop | Above daily budget |
| Secret scan | Any finding |

**Incident steps:** contain (disable the affected feature with a kill switch, revoke sessions, rotate keys), assess (what data, which shops), restore (backups and point-in-time recovery), notify affected owners plainly, then write a blameless post-mortem and add a test.

Kill switches (feature flags, server-side): AI features off, exports off, new sign-ups off, read-only mode.

## 14. Security testing

| Test | Frequency | Blocking |
|------|-----------|----------|
| RLS matrix (every table x actor) | Every PR | Yes |
| Invariants (stock, balance, totals) | Nightly and on PR | Yes |
| Secret scan and bundle grep | Every PR | Yes |
| Dependency and licence audit | Every PR | High severity |
| Failure-fuzz: no backend text in UI | Every PR | Yes |
| Rate-limit tests (429 and backoff) | Every PR | Yes |
| AI adversarial suite (`evals.md` section 5) | Prompt, tool or model change | Yes |
| DAST baseline scan against staging | Weekly | Findings reviewed |
| Manual review against OWASP Top 10 and ASVS-style checklist | Before launch, then each major release | Yes |

Abuse cases to test by hand: IDOR on every id parameter, forged `shop_id`, replayed requests (idempotency), cashier calling owner RPCs directly, stale session after role change, invite reuse, mass export, huge payloads, Unicode and emoji edge cases.

## 15. Launch security checklist

- [ ] RLS enabled on every table; policy matrix tests green
- [ ] No table readable or writable by `anon`
- [ ] Ledger tables reject direct writes (privileges and triggers)
- [ ] Cashier cannot read `product_costs`, `sale_item_costs`, `ai_usage`, `audit_log`
- [ ] Secret scan clean; bundle grep clean; service-role key only in server secrets
- [ ] AI key exists only as an Edge Function secret
- [ ] Zod validation on every input; RPC and DB constraints in place
- [ ] Rate limits live on every endpoint and verified by tests
- [ ] Error translation module covers all codes; failure-fuzz test green
- [ ] Security headers and CSP deployed and verified
- [ ] Sign-out wipes local data
- [ ] Backups and point-in-time recovery tested with a restore drill
- [ ] Kill switches tested
- [ ] Incident runbook written; key rotation rehearsed
- [ ] Dependency audit clean; branch protection on
- [ ] Privacy notice and data export/delete working

## 16. Requirement traceability

| Requirement | Enforced here | Also see |
|-------------|---------------|----------|
| No secrets in frontend/app | Section 3 | `02-technical-requirements.md` section 6 |
| Users access only authorized data | Sections 4, 5 | `05-backend-schema.md` |
| Backend and DB rules enforced | Sections 5, 6 | `06-implementation-plan.md` DoD |
| User and AI input validated | Section 6 | `guardrails.md` |
| RLS on each table with policies | Section 5 | `05-backend-schema.md` |
| Rate limiting on all APIs | Section 7 | `guardrails.md` section 6 |
| No backend errors shown | Section 8 | `04-ui-ux-design-brief.md` section 7 |
