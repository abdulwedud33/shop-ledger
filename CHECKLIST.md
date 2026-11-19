# Shop Ledger: Operations & Human Checklist

**Date:** 2026-11-19  
**Status:** Verification Complete by Antigravity (Phases 0–8).  
**Purpose:** This document lists actions reserved exclusively for the human operator that require external accounts, payments, production credentials, or real-world shopkeeper trials.

---

## 1. Automated Engineering Baseline (Completed by Antigravity)

The following were previously manual checkboxes, now fully resolved and verified with automated test suites:
- [x] **Compile & Typecheck:** `npm run typecheck` passes with zero errors under strict TypeScript.
- [x] **Linting:** ESLint 9 core web vitals + strict rules pass with zero warnings.
- [x] **Database Migrations & pgTAP:** Migrations 0001–0009 repaired; all 149 pgTAP assertions verified on remote Supabase Cloud.
- [x] **Money Parity:** 10,000 randomized property tests confirm exact parity between client half-up rounding and SQL `round(price * qty, 2)`.
- [x] **Static CDN Build & Headers:** `npm run build` exports 18 static HTML pages to `out/`; CSP SHA-256 hashes generated in `out/_headers`.
- [x] **Zero Secret Leak:** Both positive clean scan and planted-secret detection verified via `scripts/check-bundle.mjs`.
- [x] **Playwright E2E Suite:** All 14 tests covering all 13 user journeys pass across mobile viewports.
- [x] **AI Guardrails & Pipeline:** Mock Anthropic API server, 11 pipeline security tests, and 90 eval fixtures across English, Amharic, and Afaan Oromo verified with 100% safety pass rate.

---

## 2. Actions Reserved Exclusively for the Human Operator

Tick these in order before publicly onboarding retail shopkeepers:

### 2.1 Production Supabase Dashboard Configuration
- [ ] **Email Auth Settings:** In Supabase Dashboard -> Authentication -> Providers -> Email:
  - Configure SMTP provider (Resend, SendGrid, or AWS SES) for customer confirmation emails.
  - Review rate limits for Auth endpoints (default 30 sign-ups/hour).
  - Verify minimum password length is enforced at 10+ characters.
- [ ] **Maintenance Cron:** In Database -> Extensions, ensure `pg_cron` is enabled and schedule daily rate limit cleanup:
  ```sql
  SELECT cron.schedule('daily-rate-limit-purge', '0 2 * * *', 'SELECT public.purge_rate_limits();');
  ```
- [ ] **Backup & Restore Drill:**
  - Verify Daily Automated Backups or Point-In-Time Recovery (PITR) is enabled.
  - Execute one test restoration to a staging branch to verify recovery procedures.

### 2.2 Optional AI Edge Function Secrets
Only when enabling the natural language assistant features:
- [ ] Set function secrets via Supabase CLI or Dashboard:
  ```bash
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-... AI_MODEL_FAST=claude-haiku-5-5 AI_MODEL_SMART=claude-sonnet-5-5 ALLOWED_ORIGINS=https://your-domain.com
  ```
- [ ] Deploy Edge Functions:
  ```bash
  supabase functions deploy ai-parse-entry ai-insights ai-reminder
  ```
- [ ] Verify Anthropic organization settings have **zero data retention / no model training** enabled on API inputs.

### 2.3 Hosting & CDN Deployment
- [ ] Deploy the statically exported `out/` folder to a production CDN (Cloudflare Pages, Vercel, or AWS S3 + CloudFront).
- [ ] Confirm the host serves `out/_headers` (Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).
- [ ] Configure custom domain (e.g., `app.shopledger.et`) with HTTPS enforced (HSTS preload).

### 2.4 Localization & Real-World Pilots
- [ ] **Native Speaker Review:** Have native speakers review the 3 language catalogs (`src/i18n/am.ts`, `src/i18n/om.ts`, `src/i18n/en.ts`) and the 90 eval fixtures in `evals/fixtures/` to verify colloquial retail terms (e.g. Birr formatting, unit names).
- [ ] **Shopkeeper Pilot:** Conduct a 1-week pilot with 3 to 5 small retail shops in Addis Ababa or surrounding regions. Observe:
  - Time to record repeated cash sales (budget: < 10 seconds).
  - Cashier usability (verifying cashiers never see costs or margins).
  - Offline resilience during cellular network outages.
- [ ] **Compliance:** Review local regulatory guidelines regarding digital sales records and consumer phone number storage.
