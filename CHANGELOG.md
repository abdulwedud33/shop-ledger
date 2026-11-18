# Changelog and decisions

## 0.1.0 (first build)

Where the build deliberately differs from the planning docs:

1. **Business RPCs are `security definer`, not `security invoker`.** Ledger tables have no client INSERT privilege (by design), so an invoker function could not write them. Each function checks membership or owner role itself and sets `search_path = ''` (as `docs/security.md` section 5 requires).
2. **Invites use a one-time code, not an email.** `create_invite` returns a 16-character code (only its hash is stored, expires in 48 hours); `accept_invite` joins the shop. No email service is needed.
3. **Ledger foreign keys use the default `NO ACTION` instead of `RESTRICT`**, so deleting a whole shop (account deletion) can cascade cleanly. Append-only protection is unchanged: triggers block UPDATE and DELETE except during `delete_shop()`.
4. **A database rate limiter** (`rate_limit_hit`) guards write RPCs, reports, invites and shop creation, in addition to Edge and CDN limits.
5. **No TanStack Query or React Hook Form.** Reads come from IndexedDB through Dexie live queries; forms use controlled inputs with zod schemas. Fewer dependencies, smaller bundle.
6. **Cached data is not refreshed while changes are in flight**, so optimistic numbers never flicker back.
7. **Voiding needs a synced sale** (it uses the server's sale id). Editing a product's price or name is online-only.
8. **Fonts are bundled by `next/font` at build time** (no runtime request to a font host).
9. **CSP is generated per page** from the hashes of Next.js's inline scripts, so `script-src` has no `unsafe-inline`.
10. A product with no recorded cost is sold with a cost of 0, so profit is overstated until a cost is added. The UI asks owners for a cost when adding products.

## Not done yet (known gaps)

- Amharic and Afaan Oromo texts are drafts and need native-speaker review before launch.
- No barcode scanning, expenses, CSV import, app PIN lock or Ethiopian calendar display (all planned for v1.1 in the PRD).
- Evals against a real model (`docs/evals.md`) are not run; only the deterministic guardrails are unit-tested.
- ESLint rules are not configured yet.
