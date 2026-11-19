# Phase 1: Install, Compile and Lint

**Date:** 2026-11-19  
**Engineer:** Antigravity Senior Full-Stack & Test Engineer  
**Status:** Complete — All targets verified green  

---

## 1. What Was Checked and Fixed

### Package and Dependency Management
- Ran `npm install` to hydrate all project dependencies.
- Added missing test dependencies: `@playwright/test` and `fake-indexeddb` (in-memory IndexedDB for local-first sync testing).
- Resolved Next.js 15 / ESLint 9 compatibility by using `FlatCompat` from `@eslint/eslintrc` in `eslint.config.mjs`.

### ESLint Configuration (`eslint.config.mjs`)
Configured modern ESLint flat config implementing all project constraints:
- Extends `next/core-web-vitals` and `next/typescript`.
- Forbids `dangerouslySetInnerHTML` via `'react/no-danger': 'error'`.
- Enforces strict unused variable checks via `'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]`.
- Enforces React hook dependency correctness via `'react-hooks/exhaustive-deps': 'error'`.
- Ignores build artifacts (`.next/*`, `out/*`, `node_modules/*`, `supabase/functions/*`, `public/sw.js`).

### TypeScript Compiler Configuration (`tsconfig.json`)
- Added `"allowImportingTsExtensions": true` to `compilerOptions` (valid because `"noEmit": true` is set).
- Resolves TS5097 error caused by `tests/ai/guardrails.test.ts` importing Deno shared files that require explicit `.ts` specifiers.

### Codebase Fixes
1. **Property Mismatch in `src/app/sync/page.tsx`:**  
   Fixed `i.lastError` -> `i.lastErrorCode` to align with the canonical `OutboxItem` interface definition in `src/domain/outbox.ts`.
2. **Unused Imports and Bindings:**
   - `src/app/page.tsx`: Removed unused `db` import from `../lib/db`.
   - `src/app/products/page.tsx`: Removed unused `shop` binding from `useApp()`.
   - `src/app/sell/page.tsx`: Removed unused `locale` binding from top-level `SellPage` component while preserving it in child `Receipt` component where it formats localized timestamps.

---

## 2. Verification Commands & Results

| Check | Exact Command | Result |
|-------|---------------|--------|
| **Unit Tests** | `npm test` | **48/48 passed** in 4,592 ms (TAP version 13 via `tsx`) |
| **Type Check** | `npm run typecheck` (`tsc --noEmit`) | **0 errors** (exit code 0) |
| **Linter** | `npm run lint` (`next lint`) | **✔ No ESLint warnings or errors** (exit code 0) |

---

## 3. Discovered and Fixed Table

| File | Problem | Root-Cause Fix |
|------|---------|----------------|
| `eslint.config.mjs` | Missing ESLint configuration for Next 15 / ESLint 9 | Created flat config extending `next/core-web-vitals` and `next/typescript` with rules for `react/no-danger`, `@typescript-eslint/no-unused-vars`, and `react-hooks/exhaustive-deps`. |
| `tsconfig.json` | TS5097 import error with explicit `.ts` specifiers in tests | Enabled `"allowImportingTsExtensions": true`. |
| `src/app/sync/page.tsx` | Line 25 accessed non-existent property `lastError` on `OutboxItem` | Replaced with `lastErrorCode`. |
| `src/app/page.tsx` | Unused `db` import failed ESLint rule | Removed unused import `db`. |
| `src/app/products/page.tsx` | Unused `shop` binding failed ESLint rule | Removed unused binding from `useApp()`. |
| `src/app/sell/page.tsx` | Unused `locale` binding in `SellPage` failed ESLint rule | Removed unused binding from `SellPage`. |
| `package.json` | Missing `@playwright/test` and `fake-indexeddb` | Added to `devDependencies`. |

---

## 4. User Constraints & Cloud Architecture Notes
The user stated:
1. Do not use Docker.
2. Use an online/cloud database (e.g. cloud Supabase project).
3. Do not run locally; run in cloud / deployed.

**Impact on Phase 2 & onwards:**
- Instead of relying on local Docker (`supabase start` / `supabase db reset`), migrations and pgTAP tests will be targeted at the user's remote cloud Supabase project or verified via direct connection / cloud runner.
- The web app will be configured for cloud deployment (e.g., static hosting on Cloudflare Pages, Vercel, or Netlify, connected to the Supabase cloud instance).

---

## 5. Next Phase
Ready for **Phase 2: Database (migrations and schema verification against cloud database)**.
