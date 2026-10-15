# API walkthrough

The frontend and API share `http://localhost:3000`. API payloads use camelCase for inputs and database-style snake_case for resource responses. Money is a decimal **string** in requests/responses. Financial IDs are UUIDs. Identity comes from the session cookie, never `user_id` in JSON. Unknown JSON fields on input schemas are rejected.

Every POST/PATCH/DELETE needs `Origin: http://localhost:3000` (matching APP_ORIGIN). JSON endpoints require Content-Type application/json. Responses are no-store. Failures have `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`, optionally validation field descriptions. Error payloads contain no supplied password/token values. Next.js handles unsupported HTTP methods separately.

## Route reference

| Method and path | Input / behavior |
| --- | --- |
| GET /api/health | Database readiness; public, no user data. |
| POST /api/auth/register | `{email,password}`; creates user/default CAD manual account and session; 201. |
| POST /api/auth/login | `{email,password}`; new session; 200. |
| GET /api/auth/me | Current `{user:{id,email},mode}` or 401. |
| POST /api/auth/logout | Revokes current session and expires cookie. No body required. |
| GET /api/categories | Shared fixed category catalog. Requires login. |
| GET /api/accounts | Owned accounts, including disconnected ones; no access tokens. |
| POST /api/accounts | `{name,currency}` creates a manual account (CAD/USD). |
| GET /api/items | Owned institution labels, lifecycle state, has_cursor, last_synced_at, safe last_error. |
| POST /api/plaid/link-token | Returns `{link_token,mode}`. No body required. |
| POST /api/plaid/exchange | `{publicToken}`; stores encrypted Item/metadata; returns `{id}`. |
| POST /api/items/:id/sync | Authenticates the user, forwards owned active Item to internal Go service; returns event counts. |
| DELETE /api/items/:id | Durable disconnect intent, provider removal, local token erasure/account deactivation. |
| GET /api/transactions | Filters: accountId, categoryId, from, to, limit (1–100, default 50), offset (0–100000). Stable date/ID descending order. |
| POST /api/transactions | Manual accountId, description, signed amount, ISO date; optional categoryId and idempotencyKey. 201 `{id}` or duplicate 409. |
| PATCH /api/transactions/:id | `{categoryId:"shopping"}` sets override; `{categoryId:null}` restores prediction. |
| POST /api/imports/csv | `{accountId,csv}`; all-or-nothing import; 201 `{inserted,duplicates}`. |
| GET /api/summary?month=2026-10 | `{totals:[{currency,income,expenses,count}],spending:[{currency,category_id,amount}]}`. Empty datasets return empty arrays. |
| POST /api/budgets | `{categoryId,month,currency,amount}`; insert/update category/month/currency budget. Income/transfer categories rejected. |
| GET /api/budgets | All owned budgets with amount and dynamically calculated spent; UI filters by month. |

Typical status codes: 400 invalid input/CSV, 401 missing/expired session or invalid credentials, 403 wrong origin, 404 absent or unowned resource, 409 duplicate/conflict/concurrent sync, 413 oversized payload, 415 wrong content type, 429 auth throttling, 500 unexpected errors, 502 failed sync, 503 missing config/unreachable sync. Provider SDK failures that aren't explicit ApiErrors currently return the sanitized generic 500 response. Authentication/register share a limit of 10 attempts per normalized email per 15 minutes.

## Complete local mock flow

Start the system as described in README. Examples below use only synthetic data. `cookies.txt` holds a local session: do not commit or share it. Substitute the actual IDs returned by your requests.

```bash
curl -i -c cookies.txt http://localhost:3000/api/auth/register \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"email":"learner@example.test","password":"use-a-long-local-password"}'

curl -b cookies.txt http://localhost:3000/api/accounts

curl -b cookies.txt -X POST http://localhost:3000/api/plaid/link-token \
  -H 'Origin: http://localhost:3000'

curl -b cookies.txt http://localhost:3000/api/plaid/exchange \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"publicToken":"mock-public"}'

curl -b cookies.txt -X POST http://localhost:3000/api/items/ITEM_UUID/sync \
  -H 'Origin: http://localhost:3000'

curl -b cookies.txt 'http://localhost:3000/api/transactions?limit=50&offset=0'
```

Mock connection IDs are random and belong only to your session. First sync seeds two synthetic transactions; later syncs return no changes and keep the cursor. Full pagination/modified/removal behavior is covered by configurable fake providers in Go tests, not by the intentionally small browser demo fixture.

## Manual transaction, classification and override

```bash
curl -b cookies.txt http://localhost:3000/api/transactions \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"accountId":"MANUAL_ACCOUNT_UUID","description":"Coffee cafe","amount":"-4.25","date":"2026-10-01","idempotencyKey":"manual-request-001"}'

curl -b cookies.txt -X PATCH http://localhost:3000/api/transactions/TRANSACTION_UUID \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"categoryId":"shopping"}'

curl -b cookies.txt -X PATCH http://localhost:3000/api/transactions/TRANSACTION_UUID \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"categoryId":null}'
```

The response includes predicted_category_id, nullable category_override_id and effective category_id. An override remains after provider updates. Manual entries cannot be inserted into Plaid-linked accounts. Reusing a manual idempotency key returns 409 rather than returning the earlier success body; use the transaction list to reconcile an ambiguous response. No key means two repeated submissions can create two legitimate entries.

## CSV and budgets

```bash
curl -b cookies.txt http://localhost:3000/api/imports/csv \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"accountId":"MANUAL_ACCOUNT_UUID","csv":"date,description,amount,external_id\n2026-10-01,Coffee cafe,-4.25,bank-row-001\n"}'

curl -b cookies.txt http://localhost:3000/api/budgets \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"categoryId":"dining","month":"2026-10","currency":"CAD","amount":"100.00"}'

curl -b cookies.txt 'http://localhost:3000/api/summary?month=2026-10'
curl -b cookies.txt http://localhost:3000/api/budgets
```

CSV duplicates compare normalized description/date and numeric amount after matching account/external ID. A conflicting ID aborts the whole upload. The budget reflects all posted, nonremoved negative transactions in the effective category and matching currency/month. It is a target, not a constraint preventing spending.

## Authorization exercise

Create Alice and Bob in two browser profiles or separate cookie jars. Record Alice's account and transaction IDs. Bob's POST using Alice's account returns 404; Bob's PATCH or DELETE of Alice's resources returns 404; his transaction list never includes hers. Supplying a user_id field does not select the victim: strict schemas reject it. GET filters are always combined with the authenticated user's owner predicate.

## Following one request in code

`app/api/[...path]/route.ts` → `lib/api.ts:handle` (origin, session, error boundary) → `lib/routes/transactions.ts` (validation and ownership) → `lib/classification.ts` (prediction) → `lib/db.ts:transaction` (BEGIN, awaited INSERT, COMMIT, release) → 201 JSON. Failure before COMMIT triggers ROLLBACK. The browser refreshes its lists after successful mutations. The interview document develops this with concrete failure cases.

## Internal Go API

`GET /health` verifies its database connection. `POST /sync` requires `Authorization: Bearer <SYNC_SERVICE_SECRET>` and `{"item_id":"UUID","user_id":"UUID"}`. Only Next.js calls it in normal use. It has 4 KiB request bodies and a 90-second sync context. It returns counts of provider events processed, or safe generic HTTP failures. End users must call the Node `/api/items/:id/sync` route so session ownership is enforced before forwarding. Never expose the service secret in browser code.
