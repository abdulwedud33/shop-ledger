Activation: Always On

1. /docs is the specification; resolve conflicts toward the safer and more correct option and log
   them in DECISIONS.md.
2. Fix root causes. Add a test for every bug you fix. Do not delete or loosen tests.
3. Every change to SQL: re-run supabase db reset and npm run test:db. Every change to
   TypeScript: run typecheck, lint and tests. Every UI change: run the Playwright suite.
4. Never put secrets in code, git, logs or chat. Never commit .env files.
5. Report honestly: what you ran, what passed, what you could not verify.
