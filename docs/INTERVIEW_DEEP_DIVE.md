# MyFinance v2: understand and defend the implementation

This guide describes the code in this branch. Start with this honest project introduction:

> MyFinance began as an Express/PostgreSQL app that imported CSV transactions. In v2 I modernized it with a Next.js/TypeScript application, secure sessions, relational ownership constraints, a Plaid Sandbox integration and a Go service for incremental transaction synchronization. The hardest part was making database updates, cursor progress and retries consistent. It runs with a local simulator so I can test without real bank accounts.

Do not claim production users, scale, real-bank connectivity, financial returns, independent model accuracy or performance improvements. None was measured. Describe the original work and v2 implementation separately. This change was developed with coding-assistant help; be prepared to explain and reproduce the critical code yourself.

## 1. Start with the pieces

A **frontend** displays information and accepts input. A **backend** checks that input, verifies the user, applies rules and asks the database to store or retrieve information. A **database** enforces durable relationships between records. An **external API** such as Plaid may fail or return data before your own database has saved anything.

| Piece                    | Actual purpose                                                        | Start reading here                                        |
| ------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Next.js/React/TypeScript | Browser dashboard plus same-origin Node route handlers                | `apps/web/src/app/page.tsx`, `app/api/[...path]/route.ts` |
| Central API boundary     | Origin checks, session lookup, handler selection and safe errors      | `apps/web/src/lib/api.ts`                                 |
| Domain handlers          | Accounts, authentication, transactions, connections and reporting     | `apps/web/src/lib/routes/`                                |
| PostgreSQL               | Users, ownership, numeric money, constraints and atomic commits       | `database/migrations/001_initial.sql`                     |
| Go service               | Item locking, fetch pagination/retries, transaction writes and cursor | `services/sync/internal/syncer/`                          |
| Plaid                    | Simulated provider Link/token/account/transaction APIs                | `apps/web/src/lib/plaid.ts`, Go `plaid.go`                |
| Naive Bayes              | Small explainable text-category prediction                            | `packages/classifier/classifier.ts`, Go `model.go`        |
| Compose / Actions        | Reproducible development processes and automated checks               | `compose.yaml`, `.github/workflows/ci.yml`                |

Why these technologies? Next.js keeps frontend and API in one process; TypeScript helps catch shape errors; Go demonstrates explicit cancellation/concurrency and transaction management; PostgreSQL fits related financial data; Plaid Sandbox simulates external bank behavior without real accounts; Naive Bayes is understandable without a large model service. Docker and CI make setup/checks repeatable. Go is a project requirement and learning choice, not proof that Node was too slow.

## 2. Complete request-to-database walkthrough

Imagine Alice enters a CAD coffee purchase for `-4.25` on `2026-10-01` in her manual account.

1. The React form sends POST `/api/transactions` with `{accountId,description,amount,date,idempotencyKey}`. The browser sends its session cookie. No user ID is accepted in the body. The amount is the string `"-4.25"`, preserving the intended decimal representation.
2. Next.js's catch-all route calls `handle`. A mutation must have an Origin exactly matching APP_ORIGIN. Otherwise it stops with 403 before application writes.
3. `requireUser` extracts a 64-hex-character random session token from the cookie, hashes it, then SELECTs a matching nonexpired sessions row. The resulting user UUID is trusted identity. A supplied account UUID is only an untrusted resource selector.
4. The transaction handler reads the body incrementally with a byte limit. Zod checks required fields, UUID format, decimal precision, real ISO date, string lengths and unknown keys. Bad input returns 400/413/415 as appropriate.
5. `transaction` checks out one pooled database connection and executes BEGIN. `ownedAccount` selects the account by both ID and Alice's session-derived user ID. Bob's account returns 404. Plaid-linked accounts are rejected for manual writes.
6. If Alice explicitly selected a category, the handler checks it exists. Otherwise inference predicts from the description. The prediction and optional override are stored separately.
7. An awaited parameterized INSERT supplies Alice's user ID, the validated account, signed amount, account currency, date, source, prediction and idempotency key. PostgreSQL also verifies account/owner FKs, category FKs and uniqueness. The user ID is not concatenated into SQL.
8. Only after successful COMMIT does the handler return 201 with the new transaction UUID. A SQL error triggers ROLLBACK and connection release. Duplicate idempotency keys become 409; other unexpected errors become safe 500 responses with a generated correlation ID.
9. The browser reloads transactions, summaries and budgets. The list has stable date/UUID descending ordering. Reporting sums posted nonremoved values for that user, month and currency. Internal transfers are excluded from cash-flow summaries. Budget spending uses negative amounts in the effective category.

The connection must be the same throughout BEGIN/INSERT/COMMIT. Calling `pool.query` independently for each statement could use different connections and would not form the intended transaction.

A GET list follows the same session lookup but has no Origin requirement, does not mutate state and uses user ownership in its WHERE clause. Account/category/date filters add conditions; they never replace the owner predicate. The index helps select a user's recent nonremoved entries. It does not establish permission.

## 3. Authentication and authorization

Registration derives a salted scrypt hash before inserting a user/default account in a transaction. Parameters are N=32768, r=8, p=3, with a 64-byte derived key and a 16-byte random salt. The serialized hash records those parameters. Login derives the same key and compares equal-length buffers using timingSafeEqual. It performs a dummy derivation for unknown users to reduce easy timing enumeration. A shared persistent per-email attempt counter rejects attempts beyond 10 in a 15-minute window.

After registration/login, a random 32-byte token is stored in a cookie; the sessions table stores only its SHA-256 digest, owner and seven-day expiry. A stolen database session digest cannot directly be used as the cookie token. Logout deletes the current session and expires the cookie. Session creation is a separate awaited operation after registration's user/account transaction; a failure at that boundary can leave a registered account whose user needs to log in.

Authentication answers “who is this?” Authorization answers “can this user operate on this record?” Both are required. All private route handlers receive the user derived by the central boundary. Guessed UUIDs do not grant access. Composite ownership FKs additionally reject bad associations on writes, but they do not protect SELECTs by themselves.

HttpOnly, Secure, SameSite and Origin checks address different threats. HttpOnly reduces cookie theft through JavaScript; it does not stop an XSS script making requests as the user. Secure requires HTTPS and is explicitly disabled only for local development. SameSite is useful browser behavior; exact Origin checks protect mutations, including login CSRF. There is no full production identity platform, MFA or password-reset flow.

## 4. Connecting an institution

The browser requests a Link token. In Sandbox mode, Node uses the official Plaid SDK, the hardcoded Sandbox endpoint, the Transactions product, supported country codes and a session-derived client user ID. The browser opens Link and receives a public token. It sends that token back to Node, which exchanges it for a private access token and provider Item ID.

Node fetches account metadata and encrypts the private token using AES-256-GCM. It inserts the Item, account rows and initial sync state in one transaction. The private token is never returned to the browser. If persistence fails, Node attempts to revoke the new remote Item; this is best-effort compensation, not distributed atomicity.

Mock mode performs the same local encryption/persistence and synchronization flow with a deterministic provider adapter; it does not claim to exercise Plaid's hosted Link UI. Deterministic SDK contract tests mock the SDK and Go HTTP adapter tests use an in-process test server. A subsequent live Sandbox backend smoke passed token creation/exchange, account metadata, Go transaction sync, durable cursors and Item removal. It bypasses hosted Link using Plaid's supported automated Sandbox token endpoint; the hosted popup remains a manual check.

## 5. Complete synchronization walkthrough

Suppose Alice's Item has committed cursor `C0` and Plaid has two pages of changes.

1. Alice clicks Sync. Node authenticates her and SELECTs the requested active Item with Alice's owner ID. Only then does it POST Item/user UUIDs to Go with an internal bearer secret. The browser never receives that secret.
2. Go starts a database transaction, requests a transaction-scoped advisory lock for the Item and rejects a competing sync with 409. It rechecks active ownership and row-locks Item/sync state. It reads `C0` from the database rather than trusting a browser cursor.
3. Go decrypts the stored access token. For the first-ever sync the cursor is empty, so the provider request omits cursor entirely. Otherwise it sends `C0` to `/transactions/sync` with count 500.
4. Page one returns added A, modified B, removed C, next cursor `C1` and has_more=true. These events are buffered. The database cursor remains `C0`.
5. Page two uses `C1`, returns more changes and final cursor `C2` with has_more=false. The service now has a complete consistent batch.
6. If page two instead returns TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION, Go discards page one's buffered events and restarts from `C0`. Restarting at `C1` would skip or mix changes from an invalid pagination window. There are at most three complete attempts.
7. Transient network/429/server/PRODUCT_NOT_READY errors retry the same page, at most four attempts, with 100/200/400 ms waits. Permanent errors stop. The context bounds the entire sync to 90 seconds. Cursor cycles and more than 100 pages are errors.
8. With complete pages available, Go upserts account metadata and processes each page's added/modified transactions, then removals. It uses provider transaction uniqueness, exact decimal sign inversion and owner/Item/account matching. Missing accounts cannot silently drop rows: RowsAffected must be one.
9. A modification updates the provider-owned fields and prediction while preserving the user's category override. A removal tombstones the row. Normal reads, budgets and summaries omit tombstones. A later added/modified event can restore a tombstoned provider ID.
10. Go updates sync_state to `C2`, sets last_synced_at, clears last_error, and commits. All transaction changes and cursor movement become durable together. HTTP success happens after COMMIT.
11. On any SQL/validation failure, rollback discards account changes, transactions and cursor movement. A best-effort safe last_error is recorded separately without exposing provider payloads; it avoids overwriting a later successful sync's timestamp. The next manual retry resumes from the actual committed database cursor.

### Critical counterexample

Wrong: fetch page one, store cursor C1, then fail to insert A. Next time starts at C1, so A may never be fetched again.

Implemented: persist A and all other batch changes with final cursor C2 in one commit. An INSERT, cursor UPDATE or COMMIT failure is returned as failure. Tests deliberately fail both a transaction insert and the final cursor write to prove no partial persistence.

### Concurrent requests

The PostgreSQL advisory lock works across multiple Go processes, unlike a process-local mutex. Disconnect acquires the same lock before marking the Item disconnecting. If a sync already holds it, disconnect waits subject to Node's database statement timeout. Once disconnect intent commits, new syncs reject the inactive lifecycle state. Provider revocation happens outside the DB transaction; its failures remain retryable locally. There is no claim that PostgreSQL can roll back a Plaid HTTP operation.

## 6. Boundaries and alternatives worth defending

| Decision                       | Benefit                                                | Cost / viable alternative                                                  |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Same Next app for frontend/API | One origin and fewer processes                         | Separate Express service offers independent scaling/versioning.            |
| Dedicated Go sync service      | Explicit context/locking and service boundary          | Node-only sync would be simpler operationally.                             |
| Direct SQL                     | Visible queries and transaction boundaries             | ORM/query builder could improve typed results and reduce boilerplate.      |
| Database sessions              | Immediate current-session revocation and simple expiry | DB lookup per request; signed tokens need separate revocation planning.    |
| Item lock across network       | Easy-to-explain serial batch consistency               | Long transactions; staging plus leases/fencing would reduce lock duration. |
| Whole-batch buffer             | Restart safely on mutation; no partial committed pages | Memory and transaction duration grow with page count; capped here.         |
| Tombstones                     | Keep audit context and user overrides                  | Retains removed data; a retention policy is still needed.                  |
| Synthetic Naive Bayes          | Explainable and private training data                  | No representative real-world accuracy estimate.                            |
| Signed numeric amounts         | Exact database sums, readable API                      | Not a double-entry ledger; no FX or accounting reconciliation.             |
| Manual polling                 | No publicly reachable webhook required                 | Users must request sync; no scheduler/freshness guarantee.                 |

## 7. Failure scenarios

- **Database unavailable at login:** no valid session can be created; return safe error. No “logged in” response before session storage completes.
- **Repeated upload:** stable external IDs skip identical records. Conflicting records abort the entire import. Without stable IDs, identical purchases are ambiguous; the app requires IDs rather than guessing.
- **Provider timeout after several pages:** bounded retries, then rollback/no cursor change. Earlier pages are not acknowledged as stored.
- **Provider permanently requires login:** no endless retries. The current UI supports disconnect/reconnect; Link update-mode remediation is not implemented.
- **Server crashes while holding a lock:** PostgreSQL rolls back the uncommitted transaction and releases locks when the connection ends. The provider API call itself cannot be undone.
- **COMMIT happened, acknowledgement was lost:** the caller may see failure despite durable work. Retry checks actual cursor state and unique keys. This avoids duplicate durable transactions but does not magically guarantee an exactly-once response.
- **Encryption key changed:** tokens fail authenticated decryption and cursor stays unchanged. Restore the matching key or reconnect Items; there is no automatic key rotation.
- **Remote Item revocation succeeds, local completion crashes:** state may remain disconnecting. Retry/reconciliation is needed; a durable revocation outbox is not implemented.
- **Unexpected currency/precision or missing account:** fail the batch instead of rounding, silently skipping or advancing the cursor. Support is deliberately CAD/USD.
- **Bad classifier prediction:** user override wins; it is preserved through synchronization. A wrong transfer prediction can distort summaries until corrected.

## 8. What the tests establish

TypeScript unit tests cover salted passwords, encryption/tampering, origin/cookie behavior, schema validation, CSV edge cases, model artifact reproducibility and separate synthetic inference cases. Plaid contract tests verify Sandbox selection, user-scoped Link creation and server-side SDK methods without live credentials.

Node integration tests execute the real handlers against PostgreSQL: registration/login/logout/expiry, ownership, FKs, transaction filtering/duplicates/overrides, atomic CSV imports, rollback, budget calculations and mocked connection/disconnection. Go tests use programmable fake providers and local HTTP servers for pagination/retries/error contracts. PostgreSQL integration tests prove idempotency, modified/removal behavior, rollback on transaction and cursor errors, missing-account failures, per-Item concurrency and mutation restarts. Race detection checks executed Go code for data races; it is not a proof of database correctness.

The browser suite exercises the built app, real Node-to-Go HTTP, both services' database access, mock connection, repeated synchronization, category override, budgets, manual entries, CSV import, filtering, disconnection and logout. It catches configuration/serialization problems isolated unit tests miss. Container builds and live Plaid Link need their own verification. Read VERIFICATION.md for actual results rather than assuming a configured suite passed.

## 9. Thirty challenging backend questions with answers

1. **Why doesn't parameterized SQL alone fix the original authorization bug?** It keeps values from being interpreted as SQL syntax. Bob can still supply Alice's ID as a valid parameter unless the server derives identity from Bob's session and includes ownership in the query.

2. **Why both application ownership checks and composite foreign keys?** Application checks authorize reads and produce clear errors. Composite FKs reject inconsistent relationships on writes even after a programming mistake. Neither replaces the other, and no RLS policy filters reads here.

3. **Why hash passwords but encrypt access tokens?** Passwords need one-way verification; recoverability is unnecessary and dangerous. The app must recover the Plaid token to call the provider, so authenticated encryption is appropriate there.

4. **What does the salt accomplish?** It makes identical passwords produce different hashes and defeats reusable precomputed tables. It is not secret and does not turn a weak password into a strong one. The slow memory-hard work factor remains essential.

5. **Why SHA-256 for session tokens but not for passwords?** Session tokens contain 256 random bits and aren't human guesses. A fast digest is appropriate for lookup without storing the bearer token. Human passwords need expensive derivation to slow offline guessing.

6. **Does HttpOnly prevent CSRF or all XSS damage?** No. It prevents ordinary JavaScript reads of the cookie. An XSS script can still issue authenticated requests, and CSRF relies on browser cookie sending. SameSite and Origin checks address different parts of that problem.

7. **What makes logout effective immediately?** The current session row is deleted, and every private request checks the database. Other sessions remain valid; whole-account logout isn't implemented.

8. **How does a concurrent duplicate insert behave?** The unique constraint is checked by PostgreSQL. One conflicting manual insert gets 23505, mapped to 409. Provider upserts target the Item/provider-ID key. A pre-insert SELECT alone would race.

9. **Why isn't transaction content a safe deduplication key?** Two real purchases can share date, merchant and amount. The app uses stable source IDs: provider transaction IDs or CSV external IDs scoped to an account. Content checks only validate a matching CSV ID's consistency.

10. **What does the sync cursor represent?** An opaque provider checkpoint whose preceding changes the app has fully persisted. It is not a timestamp, row count or browser-controlled pagination number. It must commit with the associated data.

11. **Why restart from the original cursor after mutation during pagination?** Changes can invalidate the entire page sequence. Continuing at the latest page cursor can miss or mix data. Discard the current buffer and restart at the original durable checkpoint.

12. **Why not commit each page immediately?** That complicates rollback/restart when a later page invalidates the pagination window. Here the whole batch commits once. A more advanced staging/reconciliation design could safely reduce transaction duration, but isn't implemented.

13. **What prevents two service instances syncing the same Item?** A PostgreSQL transaction-scoped advisory lock keyed by Item ID. A local mutex would only coordinate threads inside one process. Row locks add state protection after the advisory lock.

14. **What happens if a process dies holding the advisory lock?** When its connection ends, PostgreSQL rolls back the transaction and releases its transaction-scoped locks. It doesn't need an application cleanup callback to release a leaked process-local flag.

15. **Could a hash collision in the lock key corrupt data?** It would make two unrelated Items contend for the same lock, reducing concurrency. It doesn't make their owner predicates or rows identical and therefore doesn't merge state.

16. **What if Plaid succeeds but the database INSERT fails?** The SQL transaction rolls back. The cursor is unchanged, so the batch can be requested again. An HTTP provider success is only a fetch result, not persistence confirmation.

17. **What if COMMIT succeeds but its response is lost?** The outcome is ambiguous to the client. Report failure and retry against the database's real state. Idempotent keys and committed cursors prevent duplicate durable effects. Don't claim exactly-once network execution.

18. **Which failures are retried and why bounded?** Transport errors, HTTP 429/5xx and PRODUCT_NOT_READY may be transient. They retry the same cursor up to four attempts. Permanent errors stop; mutation errors restart a separate bounded pagination loop. Limits prevent endless resource use and give the user a clear retry path.

19. **What is missing from this backoff strategy at scale?** It doesn't honor Retry-After or add jitter, and there is no central scheduler/provider quota coordination. Many instances could retry together. Those are improvements for a larger deployment, not hidden capabilities here.

20. **How do modifications preserve user intent?** Upserts update provider fields and predicted category, but never overwrite category_override_id. Queries use COALESCE(override,prediction). The user's explicit selection therefore remains effective.

21. **Why tombstone removed transactions?** Normal queries can omit them while retaining context and overrides. Reappearance can clear the tombstone on the same unique provider ID. The cost is retention/storage; deletion policy remains a future decision.

22. **How can a missing account silently lose transactions, and what stops it?** An INSERT ... SELECT may insert zero rows when its account lookup finds nothing. This service checks RowsAffected equals one and rolls back otherwise, instead of advancing the cursor with lost data.

23. **Why use numeric and decimal strings for money?** Binary floating-point cannot exactly represent many decimal fractions. PostgreSQL numeric and exact Go decimal parsing preserve stored arithmetic; API strings preserve intended precision. Browser display formatting is not the authoritative accounting computation.

24. **Can USD and CAD amounts be summed in the dashboard?** They are grouped separately. A combined total requires an explicit FX source, rate timestamp and conversion policy. No FX system is implemented.

25. **What does the owner/date index do and not do?** It supports selecting and ordering a user's nonremoved transactions. It doesn't authorize access, guarantee every query avoids sorting, or establish a measured performance claim without an execution plan and benchmark.

26. **What isolation level is used, and is it enough?** The code uses PostgreSQL's default READ COMMITTED. Per-Item advisory and row locks serialize the sync writer; constraints protect relationships and uniqueness. This is not SERIALIZABLE, and independent summary/spending requests need not represent one shared snapshot.

27. **Why isn't disconnect one atomic transaction?** PostgreSQL cannot roll back a Plaid revocation. The app records disconnect intent, calls Plaid, then finalizes locally. Failures can leave a retryable intermediate state; durable reconciliation would be a separate feature.

28. **How does Naive Bayes infer a category, and what is naive about it?** It sums class-prior and smoothed word-likelihood log scores, choosing the largest. It assumes words are conditionally independent given a category, ignoring useful phrase relationships. Unknown-only input falls back to Other.

29. **Can the eleven evaluation cases justify a real-world accuracy percentage?** No. They are small synthetic regression fixtures with vocabulary overlap and no representative sampling. Real accuracy needs consented labeled data, a separated evaluation set, leakage checks, per-category metrics and uncertainty analysis.

30. **How would you scale this design, and what would you measure first?** Measure request/sync latency, DB connection use, lock waits, page counts, retry rates and correctness failures with safe telemetry. Then consider scheduled jobs, short staging transactions, leases/fencing, least-privilege roles and cursor-based UI pagination. Don't add Kafka/Redis/Kubernetes before a measured need; no scaling results are claimed.

## 10. Glossary

| Term                 | Meaning in this application                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| API                  | An interface through which the browser or another process requests behavior.                              |
| HTTP method          | GET reads; POST creates/actions; PATCH changes selected fields; DELETE disconnects a resource here.       |
| Status code          | Machine-readable result category, e.g. 201 created, 401 unauthenticated, 409 conflict.                    |
| REST                 | Resource-oriented HTTP design style; this API also uses action endpoints for sync and Link.               |
| Route handler        | Backend function serving a URL/method.                                                                    |
| Authentication       | Establishing which user owns the session.                                                                 |
| Authorization        | Checking that identity may access a selected record.                                                      |
| Session              | A server-side record mapping an opaque token digest to a user until expiry.                               |
| Cookie               | Browser-managed request data; here it carries a bearer session token.                                     |
| Bearer token         | A credential whose possession grants its allowed access. Keep the raw value secret.                       |
| Hash                 | One-way digest; passwords require a deliberately expensive password-hashing algorithm.                    |
| Salt                 | Random per-password input preventing shared hashes/precomputation.                                        |
| scrypt               | Memory-hard password derivation used before password storage/verification.                                |
| Encryption           | Reversible secret-key protection for data needed later, e.g. Plaid tokens.                                |
| AES-GCM              | Authenticated encryption combining confidentiality with a tamper-detection tag.                           |
| Nonce                | Per-encryption unique/random value; GCM nonces must not repeat under the same key.                        |
| CSRF                 | Inducing a browser to make unwanted authenticated requests from another site.                             |
| XSS                  | Attacker-controlled script executing in the application's browser origin.                                 |
| SQL injection        | User data being interpreted as SQL syntax; parameterization separates them.                               |
| Parameterized query  | SQL with separately bound values, such as owner ID in `$1`.                                               |
| Foreign key          | Database constraint ensuring a referenced parent row exists.                                              |
| Composite key        | A key across multiple columns, here often resource plus owner or Item.                                    |
| Unique constraint    | Database-enforced prohibition on repeated key tuples.                                                     |
| Index                | Auxiliary structure helping some lookups/orderings at write/storage cost.                                 |
| Migration            | Versioned SQL change applied to move schema forward.                                                      |
| Connection pool      | Reusable database connections; a transaction keeps one checked-out connection.                            |
| ACID                 | Atomicity, consistency, isolation and durability properties of database transactions.                     |
| Atomicity            | Either every statement's changes commit, or none do.                                                      |
| COMMIT / ROLLBACK    | Make a transaction durable / discard its uncommitted changes.                                             |
| Advisory lock        | Application-selected database lock key used to coordinate Item sync operations.                           |
| Deadlock             | Transactions wait in a cycle; PostgreSQL can abort one. The app doesn't automatically retry DB deadlocks. |
| Idempotency          | Repeating an operation doesn't create additional unintended durable effects.                              |
| Upsert               | Insert a row or update an existing row on a specified unique conflict.                                    |
| Cursor               | Opaque provider checkpoint used to retrieve subsequent incremental changes.                               |
| Pagination           | Fetching a dataset/change window in successive bounded pages.                                             |
| Backoff              | Waiting longer between retries to avoid immediately repeating failures.                                   |
| Tombstone            | Marker retaining a removed transaction while excluding it from ordinary reads.                            |
| Eventual consistency | External provider state reaches local storage after a successful later sync, not instantly.               |
| Compensation         | Best-effort action reversing an external effect when a local step fails.                                  |
| Outbox               | Durable work record used to reliably retry external side effects; proposed here, not implemented.         |
| Naive Bayes          | Classifier combining word statistics under a conditional-independence assumption.                         |
| Laplace smoothing    | Adding a count so unseen word/class pairs don't get zero likelihood.                                      |
| Log likelihood       | Logarithm of a probability contribution; sums replace tiny repeated products.                             |
| Model drift          | Real input patterns change from those represented by training data.                                       |
| Unit test            | Focused test of behavior with dependencies controlled or isolated.                                        |
| Integration test     | Test exercising real component boundaries, e.g. handlers with PostgreSQL.                                 |
| End-to-end test      | Browser workflow across the built UI, application API, Go service and database.                           |
| CI                   | Automated checks run on repository events; configuration alone is not a passing run.                      |

## 11. Suggested learning order

Run mock mode and make one purchase. Trace its route and SQL with this guide. Change a category and inspect prediction versus override. Import the same CSV twice. Read the Go pagination test before the implementation, then run the rollback and concurrency integration tests. Explain aloud why the cursor must not move after a failed database write. Finally practice the questions without reading the answers. Understanding those boundaries matters more than memorizing the technology names.
