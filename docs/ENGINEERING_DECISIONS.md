# Engineering decisions and alternatives

These decisions describe implemented source, not a roadmap presented as completed work.

## 1. Next.js and TypeScript for the application

Next.js provides a real frontend, route handlers, React rendering and a production build in one application. TypeScript catches cross-layer shape mistakes during builds; Zod validates hostile runtime input because compile-time types disappear at runtime. Domain route files keep accounts, connections, transactions, authentication and reporting understandable. The archived Express code is not reachable from the v2 server.

Keeping Express as a separate server was viable and would preserve more runtime code, but its user-ID-only authentication and shared-file import pipeline required replacement. A separate API would add another process, CORS and proxy configuration without much benefit here. We retain the old route files for history rather than claiming a seamless in-place upgrade.

## 2. Go owns incremental synchronization

Go supplies context cancellation, a small HTTP server and an explicit database transaction lifecycle. It demonstrates a separate service where failure handling matters. It does not make the application inherently faster, and no throughput comparison was measured. Implementing sync in Node would be simpler operationally; Go is retained to meet this project's learning/architecture requirements. No additional services were added merely for appearance.

## 3. PostgreSQL, constraints and parameterized SQL

Accounts, owners, transactions and budgets have relational rules. PostgreSQL foreign keys and uniqueness enforce these rules under concurrent requests. Parameterized SQL makes query behavior easy to inspect and avoids user-controlled SQL interpolation. The few dynamically assembled predicates come only from a fixed allowlist; values stay parameters.

An ORM could reduce boilerplate and improve typed query results; the current pg/pq code instead exposes transaction boundaries directly for learning. Query results still require careful handling; TypeScript does not infer database schema correctness. UUIDs reduce accidental ID assumptions but are not authorization. Composite FKs and owner predicates are separate protections.

## 4. Opaque sessions instead of browser-stored JWTs

A random 256-bit cookie token points to a database session. Only its SHA-256 digest is stored; it expires after seven days. Logout deletes the row. HttpOnly blocks ordinary JavaScript reads, SameSite=Lax limits cross-site cookie sending, Secure is enabled unless explicitly disabled for local HTTP, and origin checks protect all mutations including login.

JWTs would allow offline verification but require a revocation/rotation strategy. For one backend, database sessions make logout and expiry straightforward. They add a database read on private requests. This implementation does not rotate active sessions periodically or revoke every device on logout, and provides no password reset/MFA.

Passwords use Node's scrypt with explicit N=32768, r=8, p=3, a random 16-byte salt, a 64-byte derived key, and a 64 MiB max-memory bound. The stored format includes these parameters; comparison uses timingSafeEqual. These parameters are one of [OWASP's scrypt configurations](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). Unknown-user logins perform the same derivation using a dummy hash. This reduces an obvious timing difference; it is not a proof of constant-time HTTP behavior. Per-email throttling is persisted atomically. A stronger edge-level/global abuse strategy remains necessary before public use.

## 5. Encryption versus hashing

Passwords and session lookup tokens need verification, so they are hashed. Plaid access tokens must be recoverable to call Plaid, so AES-256-GCM encrypts them. Every encryption uses a random 12-byte nonce and an authenticated 16-byte tag. Node and Go share the documented binary/base64 format. Tests reject tampered ciphertext.

An environment key is practical for local development, but offers no KMS isolation or rotation automation. Anyone with both the database and application key can decrypt tokens. Losing/changing the key without migrating ciphertext means existing Items must be reconnected. No browser-visible environment variable contains credentials.

## 6. Entire sync batch commits with its cursor

The cursor means “all changes through this point are stored.” Therefore advancing it outside the transaction writes would risk silently skipping data after a database error. All pages are collected first and applied within the same Item-locked transaction. Mutation errors discard the collection and restart from the saved cursor. Unique `(item_id,plaid_transaction_id)` supports replay and duplicate events. Tombstones retain user overrides and make removals inspectable while keeping them out of normal reads.

A durable staging table, short lock transactions and a lease/version fence could avoid holding a DB transaction over network I/O. That scales better but adds recovery states. This local app uses one bounded transaction instead: simpler correctness, but one connection/lock is held during network latency. At most 100 pages per attempt are allowed. There is no automatic database deadlock/serialization retry; a failed manual sync is safe to retry.

Retries are bounded rather than infinite. Backoff is deterministic and currently has no jitter or Retry-After handling, suitable for a small manual-triggered Sandbox app. A large polling fleet would need both, plus scheduling and provider-aware rate limits. An API success never bypasses checking Exec/RowsAffected/Commit errors.

## 7. Request-local, all-or-nothing CSV imports

The parser supports quoted fields and validates a fixed schema. JSON bytes are read incrementally with a hard cap; CSV size, row count and record size are bounded. Each row has an external ID so two legitimate identical purchases are not collapsed merely because their dates/descriptions/amounts match. Duplicate identical external IDs are skipped; conflicting content returns 409 and rolls back all rows. IDs are scoped to the account and owner.

Blind content hashes would conflate real duplicates; accepting every re-upload would double-count. The trade-off is that source transformations must provide stable external IDs. The app intentionally does not guess at arbitrary bank CSV formats or return an export that a spreadsheet might interpret as formulas.

## 8. Signed decimal money and currency-separated analytics

Income is positive; expenses negative. Plaid reverses this convention, so Go inverts its exact decimal amount. PostgreSQL numeric avoids storing binary floating-point sums. JSON string amounts retain decimal precision; the browser converts to Number only to format/visualize, never to persist aggregates. Provider balance metadata still originates as SDK number values in Node; this app makes no accounting-grade valuation claim.

Pending entries and tombstones are excluded from budgets/summaries. Transfer categories are excluded from cash-flow summaries; users can correct predictions to prevent internal transfers being mistaken for income or expense. There is no FX conversion, reconciliation ledger or double-entry accounting. Refunds are positive inflows; gross spending budgets count negative postings rather than netting refunds. This behavior is explicit rather than inferred as a full accounting system.

## 9. Explainable Naive Bayes

`training.json` has 33 synthetic descriptions: three for each of eleven categories. `train` counts documents and words. For a class C and known input words, inference computes:

`log P(C) + sum(log((count(word,C)+1)/(total_words(C)+vocabulary_size)))`

The +1 is Laplace smoothing; logs avoid multiplying many tiny probabilities. Repeated input words contribute repeatedly. Unknown words are ignored, and no known words yields Other. The algorithm assumes conditional word independence, which is often false for merchant phrases. Log scores are not calibrated confidence percentages.

The eleven fixed synthetic evaluation strings are separate phrases but share vocabulary with training. They are deterministic regression tests, not a randomized held-out production benchmark. They cannot establish model accuracy on real statements. No reported metric is fabricated. Missing merchant diversity, multilingual support, context, date/amount features, model version history per row and drift monitoring are limitations. A manual category override always wins and survives provider modifications. Retraining is explicit and does not consume users' private data.

A rules engine would be easy to audit for known merchants; richer statistical/embedding models need representative labeled data, privacy controls and evaluation. Naive Bayes keeps this demonstration small and inspectable.

## 10. Reproducibility and honest boundaries

Compose creates one database, migration job, app and internal Go process. The Node image retains build/migration tooling for a simple shared app/migration image. A slimmer production image and separate migration runner are future refinements. Containers run as nonroot. CI uses a disposable database and runs source checks plus planned container builds. It does not imply those checks have already run remotely. [VERIFICATION.md](VERIFICATION.md) records actual execution.

The original Git history is retained, including its original changelog. Sample financial records are cleared from the working tree without force-pushing or rewriting earlier commits. No deploy or main-branch merge occurs. Honest interview phrasing is: “I modernized the existing Express/CSV project and implemented the v2 backend,” not “the original application already used Go/Plaid/Next.js.”
