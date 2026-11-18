# What only you can do

Nothing below can be done from inside the chat. Tick them in order.

## 1. Get it running
- [ ] Install Node 22, Docker and the Supabase CLI.
- [ ] `npm install` (this also fetches the packages that were not available while writing).
- [ ] `npm run typecheck` and `npm run build`. **The UI code has not been compiled yet**; fix any type errors it reports (expect a few small ones).
- [ ] `supabase start`, `supabase db reset`, then `npm run test:db`. **The SQL has not been executed yet**; fix anything the 145 checks report.
- [ ] `npm test` (48 tests already pass here).

## 2. Create the real project
- [ ] Create a Supabase project; copy the project URL and the **anon** key into `.env.local` (never the service-role key).
- [ ] `supabase link` then `supabase db push` to apply the migrations.
- [ ] In Auth settings: set minimum password length to 10, enable leaked-password protection if offered, decide on email confirmation, review rate limits, set the site URL.
- [ ] Schedule `select public.purge_rate_limits();` daily (pg_cron or a scheduled function).
- [ ] Turn on database backups and point-in-time recovery; do one restore drill.

## 3. AI features (optional)
- [ ] `supabase secrets set ANTHROPIC_API_KEY=... AI_MODEL_FAST=... AI_MODEL_SMART=... ALLOWED_ORIGINS=https://your-site`
- [ ] `supabase functions deploy ai-parse-entry ai-insights ai-reminder`
- [ ] Check the model names are current in the provider's docs.
- [ ] Build the eval set from `docs/evals.md` (at least 200 sentences across the 3 languages) and run it. Do not enable AI for shops before it passes.
- [ ] Confirm the provider's data-retention and no-training settings.

## 4. Hosting
- [ ] Host `out/` on a static host (for example Cloudflare Pages). Make sure it uses the generated `_headers` file.
- [ ] Add CDN rate-limit rules for sign-in and unauthenticated traffic (`docs/security.md` section 7).
- [ ] Pin the GitHub Actions in `.github/workflows/ci.yml` to commit SHAs and turn on branch protection.

## 5. People
- [ ] Have native speakers review every Amharic and Afaan Oromo string (`src/i18n/am.ts`, `om.ts`), especially money words.
- [ ] Pilot with 3 to 5 real shops. Watch: time to record a sale, first-day activation, any lost data.
- [ ] Get advice on local data-protection requirements before public launch.

## 6. Before launch
- [ ] Walk through `docs/security.md` section 15 (launch checklist) item by item.
- [ ] Rotate any key that was ever pasted into a chat, file or terminal history.
