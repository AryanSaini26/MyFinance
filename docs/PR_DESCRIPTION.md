# Implement MyFinance v2 with secure sessions and atomic Plaid synchronization

The original Express/CSV application stored plaintext passwords, trusted supplied user IDs, and used a shared transaction file with unawaited inserts. This change adds a functional Next.js/TypeScript application with server-checked ownership, PostgreSQL migrations/constraints, encrypted Plaid Sandbox tokens, a Go incremental synchronization service, and a working finance dashboard.

The sync service processes added/modified/removed events across pagination, restarts mutated page sequences, bounds retries, serializes work per Item, and commits transaction changes with cursor advancement. The dashboard supports mock/Sandbox connections, manual sync, account/transaction views, filtering, manual/CSV entries, category overrides, summaries and budgets. Naive Bayes training/inference is separated with a synthetic dataset and matching Node/Go model artifacts.

Legacy source/history is retained; unsafe legacy startup is disabled and old financial samples are sanitized in the working tree. Earlier Git history is not rewritten. Architecture, trade-offs, security limits, API examples and an interview guide with 30 answered questions reflect actual code.

## Executed validation

- 19 TypeScript unit/security/classifier/Plaid contract tests passed.
- 10 Node/PostgreSQL handler integration tests passed.
- 18 Go tests passed with race detection, including 7 PostgreSQL integration tests; 3 HTTP subtests also passed. Go vet passed.
- Optimized Next.js build, typecheck, formatting, repeat migrations, artifact reproducibility and git whitespace checks passed.
- One browser workflow passed through the real built frontend, Node API, Go service and PostgreSQL using the local mock provider.
- npm dependency audit reported zero vulnerabilities at execution time.

## Outstanding verification and scope

No live Plaid Sandbox run (credentials unavailable), public deployment or main merge is claimed. Docker builds, Docker integration suites and the complete remote Actions job passed; see VERIFICATION.md. The local PostgreSQL test setup used a scratch-only process-identity shim because this coding environment has a single mapped UID; see VERIFICATION.md. This is a learning/Sandbox application, with explicit limits for password recovery/MFA, automated webhooks/scheduling, distributed revocation reconciliation, FX/ledger behavior and production operations. No real-world model accuracy or scale numbers are asserted.

The follow-up adds a dedicated disposable Docker integration stack (Node and Go tests against ephemeral PostgreSQL), cleanup/failure-propagation tests, a CI container-test step, and an opt-in real Sandbox backend smoke command. Actual Docker execution subsequently passed remotely. Live Sandbox execution remains unverified without developer keys.

GitHub authorization is resolved and draft PR #1 is open. Full remote CI, including real Docker integration suites, passed on published code commit fde4942844eb10b2324e31911a8031a8088e44cb (run 38665315899). Live Sandbox awaits developer keys; signup/configuration is documented in PLAID_SANDBOX_SETUP.md.
