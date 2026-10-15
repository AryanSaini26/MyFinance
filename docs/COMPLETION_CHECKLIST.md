# Finish checklist for the résumé version

The requested application behavior is implemented. The remaining release evidence needs external account/runtime access, not additional speculative features. No deployment or main merge is necessary to complete this portfolio version.

| Résumé claim | Implemented evidence | Execution status |
| --- | --- | --- |
| Next.js / TypeScript / Node application | Built dashboard, route handlers, secure sessions, ownership checks | Optimized build and complete browser workflow passed |
| Account aggregation and Plaid Sandbox APIs | Link tokens, server token exchange, encrypted Items, account metadata, disconnection | Mock browser integration and SDK contracts passed; real Sandbox check needs keys |
| Go sync service | Internal HTTP service, provider adapter, database transaction lifecycle | Real Node-to-Go browser workflow and Go tests passed |
| Transaction analytics and cash flow | Currency-separated monthly income, spending categories and net cash flow | API/database and browser tests passed |
| Budgeting | Category/month/currency budgets with posted spending tracking | API/database and browser tests passed |
| Idempotent cursor ingestion and deduplication | Persisted cursor, provider/import unique keys, transactional upserts | PostgreSQL duplicate, rollback and cursor-write-failure tests passed |
| Retries and recoverability | Bounded retries, pagination restart, Item locks, atomic commit, preserved overrides | Go tests with race detection passed |
| Naive Bayes enrichment | Explicit synthetic training set, separate training/inference, shared Node/Go artifacts, manual override | Fixed synthetic evaluation and artifact tests passed; no real-world accuracy claim |
| Dockerized integration tests | compose.test.yaml, tests/Dockerfile.node, tests/Dockerfile.go, npm run test:docker | Implemented; runner behavior tested with Docker mocked; actual container run requires Docker or CI |
| GitHub Actions CI | Source checks, real PostgreSQL tests, browser workflow, Docker image builds and containerized integration command | Configured; no remote CI run until repository writes are authorized |

## 1. Authorize repository writes

The connected user is AryanSaini26, but GitHub installation/account discovery returned no installations and branch creation returned HTTP 403 `Resource not accessible by integration`. The local terminal has no GitHub credential helper/token. This is a provider authorization problem; changing app code or loosening conversational approval settings cannot grant GitHub scopes.

Use ChatGPT Settings → Codex Cloud → Environments → Create environment, connect GitHub and select AryanSaini26/MyFinance. Approve GitHub's installation/repository prompt and any updated permissions for that repository. If a repository-management option is available under the GitHub connection, ensure MyFinance is included. Code publication needs Contents write and Pull requests write; committing `.github/workflows` also needs the applicable workflow permission in the chosen authentication method. A read-only connector will remain read-only even if the user owns the repository. The actual installation UI determines the available grant; it cannot be fabricated here.

References: [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments), [Codex GitHub integration](https://learn.chatgpt.com/docs/third-party/github), [GitHub permission errors](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#resource-not-accessible).

After authorization, publish the existing feature branch, open the prepared PR and inspect its CI results. Use the latest bundle to transfer the exact commits if a new coding environment is needed; source ZIP is available too. No reimplementation is needed. Do not merge or deploy without approval.

## 2. Run the container stack

`npm run test:docker` runs on a machine with Docker Desktop/Engine and Compose v2, or in the configured GitHub Actions job after the branch is pushed. No Plaid keys or real financial data are needed. Passing this command establishes actual Docker execution; passing the orchestration unit tests alone does not.

## 3. Verify real Plaid Sandbox

Put developer Sandbox keys in private `.env` (never Git or chat). Set PLAID_MODE=sandbox and PLAID_ENV=sandbox. Provide a separate migrated TEST_DATABASE_URL with database name ending `_test`. Run `npm run test:sandbox`; then manually open Link once through the dashboard. No production keys, real bank credentials or paid refresh endpoint is required.

The smoke test uses Plaid's supported [Sandbox public-token creation](https://plaid.com/docs/api/sandbox/#sandboxpublic_tokencreate) to exercise the backend without interactive bank login. The hosted Link UI check is intentionally separate.

## Completion boundary

Once container/CI checks and the real Sandbox smoke pass, the supplied résumé bullets accurately describe this project's implemented scope. They do not imply production usage, payments, measured performance or real-world classifier accuracy. No additional microservices, Kafka, Redis, Kubernetes, trading, FX or production deployment is needed for these two bullets. Prioritize learning the implemented request/sync paths from INTERVIEW_DEEP_DIVE.md.
