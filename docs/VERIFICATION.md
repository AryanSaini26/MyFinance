# Verification record

This document records executed checks, not expected outcomes. The implementation passed local checks and [GitHub Actions run 38665315899](https://github.com/AryanSaini26/MyFinance/actions/runs/38665315899) at published code commit fde4942844eb10b2324e31911a8031a8088e44cb. The remote run completed successfully, including real Docker image builds and the disposable Docker integration-test stack. The live Plaid Sandbox backend smoke test subsequently passed using transient developer credentials. The hosted Link popup remains a separate manual check.

## Environment

- Node.js 24.19.0 and npm 11.9.0.
- Next.js 16.4.1 / React 19, locked npm dependency graph.
- PostgreSQL 16.15, real native server and real SQL constraints/transactions.
- Go 1.26.9 for the final integration/race/vet runs; initial compilation also ran on Ubuntu's Go 1.22.2.
- lib/pq 1.12.3.
- Chromium 153 headless via a locally unpacked @sparticuz/chromium binary, driven by Playwright. The normal Playwright CDN browser download failed; the optional executable override avoids changing app code or requiring a paid service.

The coding environment permits only one mapped root UID and disallows Unix sockets. To run PostgreSQL for tests, the native PostgreSQL binaries were unpacked into scratch and launched over loopback TCP with a **test-only UID/stat compatibility shim**. SQL execution used PostgreSQL itself, not an in-memory SQL mock. The shim and disposable database are outside the repository and aren't part of local setup, Docker images or application code. This constrained test setup is not verification of production process/user isolation. Related servers/tests were launched in one command environment because separate tool invocations have isolated network namespaces.

## Executed checks

| Check                                                              | Status                                                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript unit / security / classifier / Plaid SDK contract tests | 19 passed (including 3 Docker-runner orchestration tests with Docker mocked)                                                     |
| Node handler integration tests against PostgreSQL                  | 10 passed                                                                                                                        |
| Go unit and PostgreSQL integration tests, race detector enabled    | 18 top-level tests passed, including 7 PostgreSQL integration tests and 3 additional HTTP subtests                               |
| Go vet                                                             | Passed                                                                                                                           |
| Next.js optimized production build                                 | Passed                                                                                                                           |
| TypeScript typecheck                                               | Passed                                                                                                                           |
| Migrations                                                         | Initial schema applied; repeat execution passed without reapplying                                                               |
| Synthetic classification evaluation                                | All 11 fixed synthetic cases passed; no real-world accuracy estimate                                                             |
| npm runtime dependency audit                                       | Zero reported vulnerabilities at execution time                                                                                  |
| Live Plaid Sandbox backend smoke                                   | Passed: Link token, public-token exchange, account metadata, Go transaction sync, repeated sync, durable cursor and Item removal |
| Browser end-to-end flow                                            | 1 complete workflow passed against the optimized build, Go and PostgreSQL                                                        |
| Formatting and git whitespace checks                               | Passed                                                                                                                           |
| Fresh committed-tree install                                       | npm ci, typecheck and formatting passed without generated build files                                                            |

## Negative paths actually exercised

Wrong credentials, duplicate registration, expired/revoked sessions, wrong/missing origins, malformed/oversized CSV, invalid dates, excessive precision, cross-user account writes and category overrides, composite FK violation, duplicate manual keys, repeated/conflicting CSV external IDs, category overrides/clearing, budget exclusion of pending/transfer records, wrong-user Item operations, provider HTTP retries, permanent failure, pagination cycle/page limit, mutation restart/exhaustion, missing account, failed transaction SQL, failed final cursor write, and concurrent synchronization. See the test source for exact assertions rather than inferring broader coverage.

## Initial environment limitations and current status

- **Live Plaid Sandbox:** initially blocked by missing keys; subsequently passed with supplied developer credentials, as recorded below. Deterministic CI still uses mocks/local provider servers. Hosted Link's real UI remains a separate manual check.
- **Docker Compose execution/build:** unavailable in the local coding sandbox, but subsequently executed successfully in GitHub Actions, including application image builds and the separate containerized integration suites.
- **Remote GitHub Actions:** authorization was resolved and the full remote job passed. Draft PR #1 is published and remains unmerged.
- No load test, representative accuracy study, container security scan, penetration test or public deployment occurred.

## Initial failures and fixes

The first TypeScript run found wrong relative model paths, a missing frontend account type field and an overly narrow query-client helper type; these were fixed before build success. A runtime dependency audit found a moderate csv-parse advisory; the parser was upgraded to 7.0.3 or later and the subsequent audit reported zero vulnerabilities. Source tests first failed when the PostgreSQL server was in a different isolated command network; launching server/tests together resolved the environmental issue. Browser startup exposed Go's default SSL requirement against the non-TLS local test server; development/CI URLs now explicitly disable SSL only for local PostgreSQL. Browser tests initially used ambiguous/scoped Category label locators; role-based locators and named regions resolved the test ambiguity. The final workflow found and fixed retained registration-form state after logout, then passed in 1.8 seconds (3.3 seconds including startup). Timing is a test observation, not a performance benchmark.

GitHub's create-branch tool returned 403 `Resource not accessible by integration` despite repository metadata indicating push access for the account. This is an integration capability/permission blocker, not evidence that a branch or PR was created remotely.

The normal HTTPS Git push was also attempted and failed because this coding environment has no GitHub terminal credentials (`could not read Username ... terminal prompts disabled`). No remote feature branch, PR or Actions run was created. The committed local branch is supplied as a verified incremental Git bundle and a sanitized source ZIP for review.

## Completion follow-up

- Added `compose.test.yaml`, separate nonroot test images, a sequential disposable-test runner, failure/cleanup unit tests, and a CI step running the Docker integration stack. Missing TEST_DATABASE_URL cannot silently skip Go integration tests in that stack.
- Added an opt-in live Sandbox backend smoke test that starts an isolated Go service, exercises actual Sandbox token/account/sync endpoints through the app handlers, and cleans up its own synthetic records/remote Item. Its missing-credentials guard executed and exited with an explicit not-run message. At that milestone no live Sandbox pass was claimed; the successful follow-up is recorded below.
- Re-executed Node/PostgreSQL (10 passed), Go/PostgreSQL with race detection (18 top-level tests passed), Go vet and the browser workflow (passed). The Docker runner was invoked and correctly failed because Docker is unavailable. The Compose test structure parsed and passed static assertions; that is not container execution.
- Rechecked GitHub identity: authenticated as AryanSaini26; installation/account discovery returned empty lists. Retried feature-branch creation and received the same 403 insufficient-integration-permissions response. No GitHub-side repository authorization tool is exposed. This cannot be repaired by changing this repository or merely allowing ChatGPT actions.

## Successful remote CI — 2026-10-14

[Run 38665315899](https://github.com/AryanSaini26/MyFinance/actions/runs/38665315899) / job 116195815875 completed with conclusion **success** on commit fde4942844eb10b2324e31911a8031a8088e44cb. All source, PostgreSQL, Go race/vet, audit, optimized-build, browser, Compose-build and containerized-integration steps passed. This remote run uses normal GitHub-hosted Docker/PostgreSQL; it does not depend on the local UID/stat compatibility shim. Earlier blocker descriptions above are retained as development history and are superseded by this result. Live Plaid Sandbox was still pending at that milestone; the successful follow-up is recorded below.

## Successful live Plaid Sandbox follow-up

`npm run test:sandbox` exited **0** against Plaid's actual Sandbox API and a separate migrated PostgreSQL database named `myfinance_sandbox_test`. The unmodified published implementation at 8c4b1dd87c9b5d53d89db9767178669fdb3229b0 was used. Developer credentials were supplied only through the process environment, never source, logs or Git.

The test registered its own synthetic user and verified real Link-token creation, Sandbox public-token creation, backend token exchange, encrypted Item/account persistence, actual Go `/transactions/sync` ingestion, transaction retrieval, repeated synchronization, persisted cursor/last-sync timestamp, and remote Item disconnection. Successful cleanup removed its synthetic app user and dependent rows. It used Plaid's supported automated Sandbox token endpoint rather than the hosted bank-login popup.

The first attempt failed at Link-token creation with the app's sanitized 500 error; a subsequent isolated SDK check accepted the credentials, and the complete rerun passed. The initial failure's provider cause was not captured, so it is not attributed to invalid credentials or a specific outage. No new source change or automatic retry of token exchange was needed. The smoke run is not evidence of live modified/removed events, forced pagination, mutation errors or rollback faults; those paths have deterministic provider/PostgreSQL tests.

[Run 38665793668](https://github.com/AryanSaini26/MyFinance/actions/runs/38665793668) also completed successfully on 8c4b1dd, including Docker and browser checks. Credentials are deliberately absent from normal CI. The hosted Link popup, load testing and production operation remain outside this verification.
