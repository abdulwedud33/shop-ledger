# Shop Ledger: standing instructions

Spec: /docs (read README.md first). Code and docs must agree; when they differ, correctness and
security win and the other side is fixed. Record deviations in DECISIONS.md with a reason.

Always:
- Run the real commands (install, typecheck, lint, tests, supabase db reset, pgTAP, build) and
  read the real output. Never claim something works without running it. Never invent results.
- Never weaken RLS, validation, rate limits, privileges or tests to get green. If a test is
  wrong, fix it and explain why.
- Security: no secrets in the bundle; RLS on every table; anon has no privileges; cashiers never
  read cost or profit; business writes only through RPC functions; append-only ledgers; server
  recomputes every total; idempotent client ids; no backend errors shown to users.
- UX: no spinners (layout-matched skeletons), instant feedback, fixed-layout onboarding,
  strings in en/am/om, ETB.
- scripts/gen-pgtap.py generates the pgTAP file: edit the generator, then regenerate.
- Commit after each logical fix. Keep AUDIT.md, CHANGELOG.md and docs in sync.
- Ask before: needing secrets or paid services, deleting data, rewriting git history, touching
  files outside the workspace.
- Finish every task with: Done, Verified (exact commands and results), Found and fixed, Still
  broken or not verified, Decisions, What I must do, Next.
