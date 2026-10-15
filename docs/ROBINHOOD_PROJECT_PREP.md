# MyFinance: project discussion and behavioural preparation

Start with the running demo, then explain one request and one failure path. The browser demo is a synthetic UI walkthrough; the repository's Next.js/Node API, Go service and PostgreSQL run together through Docker Compose. The real Sandbox backend smoke is documented separately in VERIFICATION.md. Keep those execution environments distinct when describing the system.

## A short technical introduction

“MyFinance is a personal-finance platform for connecting simulated bank accounts, analyzing transactions and tracking category budgets. The frontend and application API use Next.js and TypeScript. A small Go service handles Plaid's incremental transaction synchronization, and PostgreSQL stores the users, accounts, transactions and sync cursors. The main engineering concern is making retries safe: a sync either commits its transaction changes and cursor together or rolls them back together.”

This describes the implemented system. Follow it with a concrete example rather than listing more technologies.

## Five-minute demonstration

1. In the private browser demo, choose Demo App on the original homepage, then inspect the sample CAD income/expense summary and spending categories. The footer identifies the browser-only adapter.
2. Open Transactions and add a manual expense, such as “coffee cafe” for -6.25 in today's month. The shared Naive Bayes model predicts its category.
3. Override its category to Shopping. Filter the table to Shopping and open Budget to save a Shopping budget. Spending follows the effective category.
4. Open Profile, connect a simulated institution and choose Sync twice. The second call does not insert duplicate demo records. The real implementation enforces that behavior using database unique constraints and persisted cursors; the preview simulates it locally.
5. Show the Go synchronization tests in the repository. Explain the test that deliberately fails the final cursor write and asserts that earlier transaction writes rolled back. This is stronger evidence of recoverability than clicking Sync twice.

## Trace a manual expense

The browser posts `/api/transactions` with an account ID, signed decimal amount, ISO date and optional idempotency key. The Node handler checks the mutation Origin, derives the user from a hashed session token, validates the body, and queries the account using **both account ID and authenticated user ID**. The browser does not choose the owner.

Inside a PostgreSQL transaction, the handler predicts a category and inserts the transaction. A composite foreign key also prevents an account belonging to a different user from being referenced. The amount is passed as a decimal string into a numeric column. A repeated manual idempotency key returns 409. After success, the dashboard reloads its account, transaction, budget and reporting views.

Find it in `apps/web/src/lib/api.ts`, `auth.ts`, `routes/transactions.ts`, `validation.ts`, and `database/migrations/001_initial.sql`.

## Trace a synchronization failure

The web handler verifies Item ownership and calls the internal Go service with a service secret. Go starts a database transaction, obtains a nonblocking advisory lock for the Item, locks its Item/sync rows and reads the last persisted cursor. It decrypts the token, fetches all pages, retries appropriate network/provider errors with bounded backoff, and restarts the whole page sequence from the original cursor after a pagination-mutation error.

Only after collecting a complete sequence does it upsert added/modified transactions and mark removed records. Overrides remain intact. The final cursor update occurs in the **same database transaction**. If any SQL operation or commit fails, the sync does not report success. The next attempt starts from the last committed cursor and unique provider IDs prevent duplicate rows.

Holding the lock across network calls makes this design simple but ties up a database connection. Requests have deadlines and pagination limits. At larger scale, a lease/queue design could shorten database transactions, but it would require fencing, failure recovery and additional operational machinery. This implementation deliberately uses one small sync service and one database.

## Concrete engineering decisions to discuss

| Decision                                | Reason in this implementation                                                  | Trade-off                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Next.js route handlers                  | Same-origin UI/API, shared TypeScript validation, straightforward sessions     | UI and app API share a deployment                          |
| Small dedicated Go service              | Isolates provider pagination/retries and synchronization lifecycle             | A second runtime and authenticated internal HTTP hop       |
| PostgreSQL constraints and transactions | Ownership, uniqueness and data/cursor atomicity hold at persistence boundaries | A sync holds locks/connections while awaiting Plaid        |
| Opaque database-backed sessions         | Revocation is explicit; raw session tokens are not stored                      | Every authenticated request needs a session lookup         |
| AES-GCM for access tokens               | Tokens must be recoverable for Plaid calls and tampering must be detected      | Encryption-key rotation/recovery needs an operational plan |
| Synthetic Naive Bayes model             | Small, deterministic, explainable baseline; shared artifacts across languages  | Limited vocabulary and no representative accuracy estimate |
| Manual sync                             | Easy to demonstrate and reason about without background infrastructure         | No webhook-driven freshness or automatic scheduling        |

## Behavioural prompts grounded in observable work

**How did you prioritize?** Discuss the order: ownership/schema/authentication, safe ingestion, a usable dashboard, then categorization and documentation. The reason is that attractive analytics are unreliable if ownership or transaction correctness is wrong.

**Describe a difficult bug.** The follow-up audit found cached financial data remaining after logout. A subsequent user could briefly see those cached rows before their own requests completed, even though the API enforced ownership correctly. The fix clears all workspace state and invalidates old refreshes. A browser regression deliberately holds the next user's reads and verifies that the prior data is absent. This illustrates why server authorization and client lifecycle correctness both matter.

**Describe a concurrency problem.** A slow response for an earlier category filter could overwrite results for the latest selection. A refresh-generation guard rejects outdated results. The test deliberately holds the earlier response, completes the newer filter and then releases the old response.

**How do you know failure handling works?** Point to PostgreSQL integration tests for SQL rollback and cursor-write failure, mutation restarts and concurrent synchronization. Provider mocks make rare errors deterministic; a separate real Sandbox smoke checks the actual external API contract.

**What would you improve next?** Choose one actual boundary: webhook/scheduled sync, password recovery/MFA, token-revocation reconciliation, or representative categorization evaluation. Explain the failure it addresses before naming infrastructure.

**What did the audit change?** In addition to the two UI issues, it rejected empty category IDs and year-zero dates/months before SQL, and normalized Plaid SDK failures to a fixed 502 response without exposing provider request headers or tokens.

## Questions to practice aloud

- Why is a hash appropriate for passwords but encryption required for Plaid access tokens?
- What does the per-Item lock prevent, and what would happen with two Go replicas?
- Why does an HTTP 200 from Plaid not prove synchronization succeeded?
- What happens if the process dies after fetching pages but before committing?
- What happens if the server commits but the browser loses the response?
- Why restart pagination from the original cursor after a mutation?
- Which constraints enforce ownership and which prevent duplicates?
- Why are transfers, pending entries and removed transactions excluded from cash-flow summaries?
- Why are CAD and USD totals separate?
- What does the synthetic classifier evaluation establish, and what does it leave unknown?

Use INTERVIEW_DEEP_DIVE.md for the longer answers and glossary. You should be able to explain the manual-request and sync-failure paths without memorizing source line numbers.

## Frontend provenance and modernization

The original application spans three repositories: the Express/CSV backend, a dark purple Next.js homepage, and a navy Chakra dashboard. The later two repositories were provided after the first v2 dashboard was built. Their original branding, page structure, theme and component design now drive the v2 frontend. The first v2 design is retained only as historical reference. New work connects these screens to authenticated APIs, fills the original Budget placeholder, and replaces unsafe user-ID URLs, client session markers and hardcoded totals. Consult ORIGINAL_UI_INTEGRATION.md for exact upstream commit IDs and changes. This is modernization and integration of an existing design, not an assertion that those original templates were newly designed here.
