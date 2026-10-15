# Review guide

## What changed

- `apps/web/`: implemented a Next.js/TypeScript dashboard and same-origin Node API. Domain handlers cover sessions, accounts, Plaid lifecycle, manual/CSV transactions, overrides, reporting and budgets.
- `database/migrations/`, `scripts/migrate.ts`: relational schema, ownership/uniqueness rules, indexes, transactional checksummed migrations.
- `services/sync/`: implemented a dedicated Go service with incremental cursors, pagination/mutation restart, bounded retries, per-Item locks, exact amounts, atomic persistence and preserved overrides.
- `packages/classifier/`, `scripts/train.ts`: explicit synthetic dataset and deterministic multinomial Naive Bayes model with equivalent Node/Go inference.
- `tests/`: meaningful security, handler/database, provider, synchronization and browser workflow tests.
- `compose.yaml`, `compose.test.yaml`, development/test Dockerfiles, `.github/workflows/ci.yml`: local containers and automated checks; container execution and integration suites have passed in GitHub Actions.
- `README.md`, `docs/`: setup, audit, schema/decisions, API examples, truthful history, security limits, verification, and beginner-friendly interview explanations with 30 technical Q&As.
- `src/backend/server.js` and historical sample files: disabled unsafe legacy startup and sanitized financial samples while retaining legacy route source and Git history.
- Root package/lock/config: modern workspace/scripts and removal of obsolete runtime dependency surface.

## Suggested review order

1. Read AUDIT.md to distinguish original behavior from v2.
2. Run the mock demonstration described in README.
3. Read the schema and ownership checks in `lib/routes/transactions.ts`.
4. Read Go `Collect` and `Service.sync`, then the PostgreSQL rollback/concurrency tests.
5. Inspect authentication/encryption, the API error boundary and disconnect intermediate states.
6. Read VERIFICATION.md for actual results and unavailable checks.
7. Use INTERVIEW_DEEP_DIVE.md to explain the critical paths aloud.

## Scope limits to keep visible

No paid service, live bank, public deployment, force push, main merge, destructive history rewrite or original-database migration is part of this change. Live Sandbox needs credentials. The feature branch and draft PR #1 are published; no merge is authorized. Production-grade identity, background webhooks/scheduling, FX, a ledger, operational reconciliation/outbox and benchmark claims are outside the implemented scope.

The completion follow-up adds a disposable Docker integration runner and live Sandbox smoke-test command. `docs/COMPLETION_CHECKLIST.md` maps every résumé claim to code, tests and remaining account-dependent verification.
