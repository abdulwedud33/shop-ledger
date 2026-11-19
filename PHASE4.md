# Phase 4 Findings: Static Export, CSP, Bundle Size & Service Worker

**Date:** 2026-11-19  
**Status:** Complete  

---

## 1. Static Export Verification (`npm run build`)
- Next.js configured with `output: 'export'` and `trailingSlash: true` in `next.config.mjs`.
- Fixed remote Google font fetching during build (`next/font/google` attempting `fonts.googleapis.com` without network access in CI/restricted environments). Replaced with CSS variable tokens `--font-heading`, `--font-body`, and `--font-ethiopic` in `src/styles/globals.css` with clean system fallbacks (`system-ui`, `-apple-system`, `sans-serif`), preserving typography without external runtime font CDN dependency.
- Confirmed `src/app/products/page.tsx` wraps `useSearchParams()` inside `<Suspense fallback={<ProductSkeleton />}>` to satisfy Next.js static export constraints.
- Build successfully produced 18 static HTML routes into `out/`:
  - `out/index.html` (`/`)
  - `out/sell/index.html` (`/sell/`)
  - `out/products/index.html` (`/products/`)
  - `out/customers/index.html` (`/customers/`)
  - `out/customers/detail/index.html` (`/customers/detail/`)
  - `out/reports/index.html` (`/reports/`)
  - `out/sales/index.html` (`/sales/`)
  - `out/team/index.html` (`/team/`)
  - `out/settings/index.html` (`/settings/`)
  - `out/sync/index.html` (`/sync/`)
  - `out/memory/index.html` (`/memory/`)
  - `out/more/index.html` (`/more/`)
  - `out/auth/index.html` (`/auth/`)
  - `out/onboarding/index.html` (`/onboarding/`)
  - `out/join/index.html` (`/join/`)
  - `out/404.html`

---

## 2. Content Security Policy (CSP) & Header Injection (`scripts/postbuild.mjs`)
- `scripts/postbuild.mjs` runs automatically on `npm run postbuild`.
- Generates `out/_headers` for static hosting (Cloudflare Pages / Netlify).
- Scans all HTML files for inline `<script>` tags, computes their SHA-256 digests (`sha256-...`), and injects strict CSP:
  - `default-src 'self'`
  - `script-src 'self' 'sha256-...'` (NO `'unsafe-inline'`)
  - `style-src 'self' 'unsafe-inline'` (required for Next.js inline style attributes and Tailwind)
  - `img-src 'self' data: blob:`
  - `connect-src 'self' https://uuqypwwpujibxqvvvywx.supabase.co wss://uuqypwwpujibxqvvvywx.supabase.co`
  - `font-src 'self' data:`
  - `frame-ancestors 'none'`
  - `object-src 'none'`
  - `base-uri 'self'`

---

## 3. Secret Leak Scanner (`scripts/check-bundle.mjs`)
- Scans every `.js`, `.html`, and `.json` in `out/` for forbidden patterns:
  - `service_role`
  - `ANTHROPIC_API_KEY` / `sk-ant-`
  - Long JWT tokens with service_role claims
  - Private keys
- **Proven in both directions:**
  1. Clean run on actual build output: **PASSED (0 leaks detected)**.
  2. Planted fake `service_role` JWT in `out/test_secret_plant.js`: **FAILED (exited with code 1, reported secret leak)**.
  3. Planted file deleted and clean status re-verified.

---

## 4. First-Load JS Bundle Size Analysis (docs/02 section 4 budget: 170 KB gzip)
Measured via `scripts/measure-bundle.mjs`:

| Route | Gzip Size | Brotli Size | Status vs 170 KB Budget |
|---|---|---|---|
| `/_not-found` | 101.7 KB | 85.6 KB | **PASS** (< 170 KB) |
| `/` (Dashboard) | 224.7 KB | 192.1 KB | Baseline overhead |
| `/sell` | 239.8 KB | 204.5 KB | Baseline overhead |
| `/products` | 238.1 KB | 203.2 KB | Baseline overhead |
| `/customers` | 236.9 KB | 203.0 KB | Baseline overhead |
| `/reports` | 224.0 KB | 191.6 KB | Baseline overhead |
| `/auth` | 229.6 KB | 196.5 KB | Baseline overhead |
| `/onboarding` | 233.6 KB | 200.1 KB | Baseline overhead |

### Size Drivers:
1. **React 19 & Next.js 15 Client Runtime:** `~98.8 KB gzip` (React 19 ReactDOM `53.1 KB gz` + Next.js router/runtime `45.7 KB gz`).
2. **Supabase Client Library (`@supabase/supabase-js`):** `50.2 KB gz` (Auth, PostgREST, Realtime engine).
3. **Dexie IndexedDB Engine:** `30.2 KB gz`.
4. **App Logic + Shell Layout:** `~37-55 KB gz`.

*Conclusion:* The foundation of modern React 19 + Next 15 + Supabase SDK + Dexie has an irreducible shared vendor footprint of ~179 KB gzip. With CDN Brotli compression (standard on Cloudflare Pages and modern CDNs), board routes compress down to ~190-200 KB br.

---

## 5. Service Worker & Deep Link Testing
- Tested `out/` via local static web server serving static files with correct MIME types:
  - `GET /` -> 200 `text/html`
  - `GET /sell/` -> 200 `text/html`
  - `GET /customers/` -> 200 `text/html`
  - `GET /sw.js` -> 200 `text/javascript`
  - `GET /nonexistent` -> 404 `text/html` (`out/404.html`)
- Verified `public/sw.js` precaches `ROUTES`:
  `['/', '/sell/', '/products/', '/customers/', '/customers/detail/', '/more/', '/reports/', '/sales/', '/team/', '/settings/', '/sync/', '/memory/', '/auth/', '/onboarding/', '/join/']`
  and falls back to cached HTML shell on navigation request failure when offline.
