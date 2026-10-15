# MyFinance v2

A working personal finance learning application: Next.js/TypeScript frontend and API, PostgreSQL, a Go transaction synchronization service, and explainable Naive Bayes categorization. Bank connections use a local simulator by default or **Plaid Sandbox only**. No real money moves.

This v2 implementation modernizes the original Express/CSV application at baseline `92f23aa`. Legacy source is retained under `src/` for historical review; its unsafe server entry point is disabled. The original checkout did not contain a complete runnable frontend, migrations, sessions, Plaid, or Go infrastructure. See [the audit](docs/AUDIT.md). No performance or real-world model-accuracy claims are made.

## Run locally with Docker Compose

Requirements: Node.js 24 (to generate local configuration), Docker Engine/Desktop with Compose v2. No paid services or Plaid credentials are required in mock mode.

```bash
npm run env:init
docker compose up --build
```

Open http://localhost:3000, choose **Create an account**, and use a password of 12–128 characters. Choose **Connect institution**, then **Sync**. Mock mode creates a synthetic checking account and two current-month transactions. Repeating Sync does not duplicate them. Add a manual transaction or import a CSV into the automatically created Cash / CSV account. Override a category in the transaction table, then create a budget in that category.

`env:init` creates an ignored `.env` with independent random database, token-encryption and internal-service secrets; it refuses to overwrite an existing file. `.env.example` contains placeholders. Keep `.env` private. Compose starts PostgreSQL, runs migrations, then starts web and sync. The database and web ports bind only to localhost; sync has no published port. `docker compose down` retains the database volume.

Container builds were not executable in the implementation environment because Docker was unavailable. See [executed verification and outstanding checks](docs/VERIFICATION.md), not CI configuration alone, for test evidence.

## Run without Docker

Requirements: Node.js 24, Go 1.26.9 or later supported Go release, PostgreSQL 16, and an empty development database. Create a PostgreSQL user/database matching your `.env` or edit `DATABASE_URL` for your local installation. Use a fresh database, never the original app's database.

```bash
npm ci
npm run env:init
# Edit DATABASE_URL to point to your own local PostgreSQL instance.
set -a
. ./.env
set +a
npm run db:migrate
npm run dev
```

In another terminal, load the same `.env` from the repository root, then run:

```bash
set -a
. ./.env
set +a
cd services/sync
go run ./cmd/sync
```

The web app is on port 3000 and the internal sync service on 8080. Manual sync requires both processes. `npm run build && npm start` runs the optimized web build instead of the development server. Migrations are explicit and do not run on every request.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL. Example uses `sslmode=disable` for localhost development only. TLS validation is never globally disabled. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose database provisioning; keep these consistent with DATABASE_URL when running natively. |
| `APP_ORIGIN` | Exact browser origin including scheme and port; required on all API mutations, including curl requests. |
| `COOKIE_SECURE` | `false` only for local HTTP. Default when unset is secure cookies; use true for HTTPS. |
| `TOKEN_ENCRYPTION_KEY` | 64 hex characters encoding a 32-byte AES-GCM key, shared by web and Go. Changing it without re-encryption makes existing tokens unreadable. |
| `SYNC_SERVICE_SECRET` | At least 32 random characters; web authenticates internal sync requests with it. |
| `SYNC_SERVICE_URL` | Go service origin; overridden to `http://sync:8080` by Compose. |
| `PLAID_MODE` | `mock` or `sandbox`. No production mode exists. |
| `PLAID_ENV` | Must be `sandbox` for API calls. |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Sandbox keys from your Plaid dashboard; ignored by the local mock. Never use NEXT_PUBLIC variables for secrets. |

## Plaid Sandbox

1. Obtain developer Sandbox keys from [Plaid's dashboard](https://dashboard.plaid.com/). Set `PLAID_MODE=sandbox`, `PLAID_ENV=sandbox`, and the two keys in `.env`.
2. Restart the processes (`docker compose up --build` recreates containers when their environment changes). In the dashboard choose Connect institution, then Open Plaid Sandbox Link.
3. Select a supported non-OAuth test institution, such as First Platypus Bank. Use Plaid's test credentials, not real bank credentials. The standard Sandbox example is `user_good` / `pass_good`; dynamic transaction testing is described in the official docs below.
4. After Link completes, the backend exchanges the public token, fetches metadata, encrypts the access token and stores the Item and accounts atomically. Choose Sync; if the initial response is empty, wait and retry after Sandbox data becomes ready.
5. Disconnect revokes the Sandbox Item and clears its stored token. Historical transactions remain visible; linked accounts become inactive.

Do not switch modes with active Items from the other mode: disconnect them in their original mode first or use a separate fresh database. Live Sandbox testing was not performed without credentials. Official references: [Quickstart](https://plaid.com/docs/quickstart/), [Transactions integration](https://plaid.com/docs/transactions/), [sync API](https://plaid.com/docs/api/products/transactions/#transactionssync). This implementation uses manual polling, not webhooks or paid refresh endpoints.

## Repository structure

```text
apps/web/src/app/          Next.js dashboard and API route entry point
apps/web/src/lib/routes/   Authentication, accounts, connections, transactions, reporting
apps/web/src/lib/          Sessions, encryption, database pool, validation, Plaid adapter
services/sync/cmd/sync/    Internal HTTP server
services/sync/internal/    Pagination/retries, PostgreSQL transactions, model inference
packages/classifier/      Synthetic training data, training/inference code, model artifact
database/migrations/      Versioned SQL schema
scripts/                  Environment setup, migrations, model training
tests/                    TypeScript unit/API integration tests and browser tests
docs/                     Architecture, decisions, walkthrough and interview material
src/                      Archived v1 source, excluded from v2 runtime
```

## Database and consistency

Run `npm run db:migrate` against the configured database. SQL migrations are ordered, checksummed, and applied under a transaction-scoped migration lock. A changed applied migration is an error: add a new migration instead. The schema has users, sessions, auth attempt buckets, Plaid Items, accounts, transactions, categories, budgets and sync state. [Architecture](docs/ARCHITECTURE.md) explains keys, indexes and relationships.

Transactions use PostgreSQL numeric values and decimal strings in JSON; expenses are negative and income positive. Plaid's positive-expense convention is inverted during synchronization. CAD and USD are supported; totals and budgets never mix currencies. Pending and removed transactions are excluded from summaries/budgets, as are transfers from cash-flow summaries.

A sync holds a per-Item PostgreSQL advisory lock, fetches all pages, restarts from the saved cursor after pagination mutation, then commits transaction changes and the new cursor in the same transaction. Unique provider transaction IDs make replays safe. Database failures roll everything back. A duplicate manual idempotency key returns 409; repeated CSV external IDs skip identical rows and reject conflicting content.

## CSV contract

Use UTF-8, exactly these headers, ISO dates, signed decimal amounts and stable per-account `external_id` values. The account supplies the currency. Quoted commas are supported. Maximum 1 MB and 1,000 rows. There is no shared intermediate file.

```csv
date,description,amount,external_id
2026-10-01,"Coffee, bakery",-4.25,statement-row-1
2026-10-02,Salary payroll,2000.00,statement-row-2
```

Different real transactions must have distinct external IDs even when their descriptions/amounts match. Reusing an ID with different data returns 409 and rolls back the whole upload. Bank-specific CSV formats need an explicit transformation to this schema. There is no CSV export that executes spreadsheet formulas.

## Tests and CI

Integration tests **truncate users and dependent tables**. Use a separate disposable migrated test database, never personal data. Do not run the Node and Go integration suites concurrently against the same database.

```bash
npm ci
npm test
npm run typecheck
npm run format:check
npm run model:train
npm run build

# Export URLs to a disposable PostgreSQL database first:
export DATABASE_URL='postgres://myfinance:YOUR_TEST_PASSWORD@localhost:5432/myfinance_test?sslmode=disable'
export TEST_DATABASE_URL="$DATABASE_URL"
npm run db:migrate
npm run test:integration
(cd services/sync && go test -race -count=1 -v ./... && go vet ./...)

# Load mock-mode environment, with the same test DATABASE_URL and TEST_DATABASE_URL:
npx playwright install chromium
npm run test:e2e
```

The browser suite starts web and Go automatically; leave those ports free. It needs a prior web build and the app environment (APP_ORIGIN, COOKIE_SECURE, TOKEN_ENCRYPTION_KEY, SYNC_SERVICE_SECRET, SYNC_SERVICE_URL, PLAID_MODE and PLAID_ENV). Ensure Go is on PATH. Go tests skip integration cases when TEST_DATABASE_URL is absent and print the skip reason; that is not evidence of integration success. [GitHub Actions](.github/workflows/ci.yml) provisions PostgreSQL, runs these checks, audits runtime dependencies, and validates/builds Compose containers. Remote CI results remain unverified until the branch can be pushed.

## Disposable Docker integration tests

```bash
npm run test:docker
```

This uses `compose.test.yaml`, separate Node/Go test images and an ephemeral PostgreSQL database. It needs Docker with Compose v2; it does not load `.env`, publish database ports, mount the development volume or contact Plaid. The runner selects a unique project, runs Node and Go suites sequentially (both reset the test database), propagates failures and cleans up its test resources. Go is not permitted to silently skip integration tests in this stack. CI runs this command too. The runner has unit tests with Docker mocked; those do **not** establish that containers ran here. Actual Docker execution remains blocked in this environment.

## Optional live Sandbox backend smoke test

Configure `PLAID_MODE=sandbox`, `PLAID_ENV=sandbox`, `PLAID_CLIENT_ID`, and `PLAID_SECRET` in your private `.env`. Also set `TEST_DATABASE_URL` to a **separate** database whose name ends in `_test`, for example `myfinance_test`. Migrate that database first, then run:

```bash
# After loading .env, point migration at the separate TEST_DATABASE_URL:
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
npm run test:sandbox
```

Requires Go on PATH and PostgreSQL. The command creates a synthetic app user, requests a real Sandbox Link token, uses Plaid's Sandbox-only public-token endpoint, exchanges it through the application backend, fetches accounts, starts an isolated Go service, syncs transactions/cursor, repeats sync, and disconnects the temporary Item. It then deletes its own synthetic user; if remote disconnection fails, recovery state stays encrypted in the test database. It never truncates that database. Missing configuration fails before network calls. The hosted Link popup still needs a manual browser check. The live smoke test was not executed without credentials.

## Classification

`npm run model:train` trains a multinomial Naive Bayes model from **33 hand-authored synthetic descriptions**, not personal financial records. Inference is separate; Node and Go consume the same generated counts/vocabulary. The test suite checks 11 fixed synthetic evaluation descriptions and unknown-word fallback, not representative bank data. The UI displays predictions and allows overrides; sync preserves those overrides. See [engineering decisions](docs/ENGINEERING_DECISIONS.md) for the formula and limits.

## API examples and learning path

```bash
curl -i -c cookies.txt http://localhost:3000/api/auth/register \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"email":"learner@example.test","password":"use-a-long-local-password"}'
curl -b cookies.txt http://localhost:3000/api/accounts
curl -b cookies.txt 'http://localhost:3000/api/transactions?limit=50&offset=0'
```

Read [API walkthrough](docs/API_WALKTHROUGH.md) for routes and full requests. Then follow [the interview deep dive](docs/INTERVIEW_DEEP_DIVE.md): actual source paths, complete request/sync walkthroughs, failure reasoning, 30 interview questions with answers, and a glossary.

## Troubleshooting and limits

- **403 ORIGIN_REJECTED:** APP_ORIGIN must exactly match the browser or curl Origin, including localhost vs 127.0.0.1 and port. Restart after changing environment.
- **Login works but subsequent requests say unauthorized:** for local HTTP set COOKIE_SECURE=false; clear stale cookies. Use one hostname consistently.
- **SYNC_UNAVAILABLE:** run Go with matching database/key/secret and verify SYNC_SERVICE_URL. Compose does not publish the internal service.
- **SYNC_FAILED or empty first sync:** inspect Item last_error, verify mode/key consistency, wait for Sandbox initialization and retry. Provider response bodies/tokens are intentionally never returned or logged.
- **Database startup/migration failure:** use an empty v2 database; ensure PostgreSQL is reachable. Changing POSTGRES_PASSWORD does not reset a password in an existing volume.
- **CSV import fails:** check required headers, external IDs, date/amount format, size and account ownership.
- **Playwright browser download unavailable:** install Chromium through a trusted supported path and optionally set PLAYWRIGHT_CHROMIUM_EXECUTABLE to it. CI uses Playwright's normal browser installation.
- Balances are provider metadata, not a ledger-derived or real-time available balance. No FX conversion, payments, investments, webhook worker, password recovery or automatic legacy-data migration is implemented. Link errors requiring re-authentication currently require disconnect/reconnect. [Security limits](docs/SECURITY.md) and [verification](docs/VERIFICATION.md) are explicit.

No public deployment or merge is part of this change.
