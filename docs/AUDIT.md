# Original repository audit and v2 changes

Audited baseline: `92f23aa194fc737276e63dac40dcad97fa97e483`. The remote advertised only `main`; its four commits and all tracked files were inspected. There was no AGENTS.md, test suite, schema migration, Docker setup, Plaid integration or Go service. This document separates observations from new work. Git history is preserved.

| Original location | Observed problem | v2 treatment |
| --- | --- | --- |
| `src/api/registerAPI.js`, `loginAPI.js` | Plaintext password INSERT and equality lookup. Login returned a user ID, not an authenticated session. | Salted scrypt password hashes; opaque expiring sessions stored as SHA-256 digests. |
| Username, transaction, chart, insert routes | Request bodies supplied `user_id`; there was no session authorization. SQL parameters alone did not prevent cross-user access. | Server derives user identity from the session. Queries filter by that identity; composite ownership FKs add database protection. |
| `src/api/uploadAPI.js` | Unbounded in-memory uploads; comma/newline splitting broke quoted CSV; final row could be dropped; request content was logged. | Bounded streaming JSON body, bounded CSV parser, strict schema and ISO dates. No upload-content logging. |
| `uploadAPI.js`, `insertAPI.js` | All users shared `userTransactions.json`; classification and insertion used separate requests and disk state. | Request-local parsing and one database transaction; no temporary transaction files. |
| `insertAPI.js`, `addToDatabase.js` | Async inserts were not awaited; successful HTTP/log messages could precede persistence. Hardcoded user/month in helper. | Awaited statements and COMMIT; complete rollback on a failed row or conflict. |
| `src/backend/server.js` | `ssl.rejectUnauthorized=false`, permissive CORS fallback, checked-out connection never released, startup errors not awaited. | New pooled Node API with connection cleanup and timeouts; normal TLS validation. Plaintext PostgreSQL only on the documented local development network. |
| Chart/summary routes | Month strings mixed different years; null aggregates and inconsistent response shapes; many redundant queries. | ISO dates and month boundaries, grouped SQL, zero defaults, currencies kept separate. |
| Learning JSON and financial sample files | Bank transaction descriptions and identifying remnants were committed; repeated samples, stale pre-trained data, some clearly wrong labels. | Financial sample files sanitized in the working tree. New explicitly synthetic dataset; deterministic model artifact and separate inference. |
| `src/routes.js` | Referenced missing Chakra UI views/components and packages. `public/index.html` expected missing CRA assets. | New Next.js frontend. Archived source remains for review, but is not imported by v2. |
| Root package scripts/dependencies | Node 20.2 pinned, obsolete Babel dependency, missing sitemap-builder script, no checks. | Node 24 workflow, TypeScript, lockfile, automated unit/integration/browser checks. |
| Original query strings | Most SQL queries were already parameterized. | Preserve parameterization; allowlisted filtering and runtime validation. No claim that every original query was injectable. |

## Preservation and privacy

Legacy route source remains under `src/`; its server entry point now immediately throws with migration guidance. Its old dependencies are deliberately absent from the v2 runtime. The original server text is retained as an archived comment. Sanitized JSON files retain their paths but no financial records or trained artifacts derived from those records. The old changelog and license are preserved. This is a modernization of the existing repository, not evidence that the original app had v2 features.

Prior commits still contain the original samples. This branch does not erase them: rewriting history would require separate authorization. Do not treat working-tree sanitization as removal from Git history. No original database was accessed or changed. Start v2 against a fresh database; no automatic migration of legacy passwords or financial records is included.

## Remaining boundaries

This is a local Sandbox/learning application. It has no password reset, email verification, MFA, distributed abuse protection, authenticated Plaid webhook receiver, background scheduler, account deletion, formal penetration test, or production operational runbook. Per-email throttling is not comprehensive DoS prevention. Logout revokes the current session only. These are explicit limits, not claimed implementations. See [SECURITY.md](SECURITY.md).
