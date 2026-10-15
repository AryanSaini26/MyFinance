# Security review and scope

This is a local simulated-finance application, not a production financial service. It contains no payments, real-bank mode or public deployment configuration.

## Implemented controls

- Explicitly configured salted scrypt password hashing; timing-safe derived-key comparison and dummy derivation for unknown users.
- Random opaque HttpOnly SameSite cookies, Secure by default, seven-day server expiration; hashed session tokens and current-session logout revocation.
- Exact configured Origin on all mutations; no wildcard CORS; same-origin frontend/API.
- Runtime strict input schemas, parameterized queries, owner predicates and composite ownership foreign keys.
- AES-256-GCM encryption of Plaid access tokens at rest. Link/public tokens only enter browser-supported flows; access tokens are never returned to the browser.
- Hardcoded Plaid Sandbox host with production mode rejected. No request/response-body or CSV logging. Unexpected API logs contain only generated request IDs.
- Request/CSV/record/row/page/time bounds; awaited writes; explicit rollback; per-Item transaction locks; unique transaction/import keys.
- Baseline TLS validation bypass is absent from the new runtime. Local PostgreSQL is explicitly non-TLS on loopback/container networking; remote connections must use a trusted CA and certificate verification.
- `.env` and build/test artifacts ignored. Example config uses placeholders; CI fixtures and test-only keys are synthetic, not active service credentials.
- Container processes use nonroot users; internal Go port is unpublished; CI permissions are read-only.
- Basic browser headers prevent framing, MIME sniffing and object embedding. The CSP is intentionally limited, not a strict script-src/nonce CSP compatible with every Plaid/Next flow.

## Residual risks and unfinished production controls

There is no email verification, recovery flow, MFA, account deletion, whole-account session revocation, rotated secrets/KMS, encrypted backup system, RLS, separate least-privilege database roles, global/IP abuse protection or production observability. Auth bucket/session tables need a maintenance policy for growth. Per-email throttling can be bypassed with many addresses and can be used to temporarily lock out an address; it is a local demonstration control, not complete brute-force/DoS prevention.

External provider operations cannot commit atomically with PostgreSQL. Failed exchange compensation can leave a remote orphan; disconnects can remain disconnecting if remote revocation fails or a process crashes. Tokens are retained encrypted until successful disconnection so the user can retry. A durable revocation outbox and provider-state reconciliation remain future work. No raw provider error body is exposed to solve these operational issues.

Sync failure messages intentionally expose little detail. This avoids credential leakage but limits diagnostics; production would need structured safe error-code logging and monitoring. Never add whole Axios/Plaid errors to logs: they may include request headers or tokens. `last_error` is only a safe code and its recording is best effort.

PostgreSQL and Node/Go trusted deployments still need resource limits, trusted certificate configuration, secret distribution and network policy. Dependency audits are point-in-time checks, not proof of security. No container vulnerability scan or formal penetration test was executed.

## Legacy data

Archived source is unreachable from v2. Previously committed financial samples were sanitized in this working tree, but remain in earlier Git history because no history rewrite was authorized. The original database was never connected. Do not run archived routes or deploy this branch as an upgrade against that database. Treat any future data migration as a separate reviewed operation.

## Reporting

For a security issue, provide reproduction steps using synthetic data and omit passwords, access tokens and personal statements. Do not include credentials in a public issue.

Category overrides persist for the same provider transaction ID. A pending-to-posted transition can use a different ID; overrides are not automatically transferred between those distinct records.
