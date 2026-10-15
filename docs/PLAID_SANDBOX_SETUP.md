# Get free Plaid Sandbox keys

MyFinance's account connection is implemented and its real Sandbox backend smoke test has passed. Reproducing that test requires keys from your own developer account. Mock mode continues working without them. Sandbox uses simulated financial data and is free; this project does not need a Production/Trial application or a real bank login.

## 1. Create the developer account

Open https://dashboard.plaid.com/signup, register with your own email and verify it. If asked what you are building, describe it truthfully: “MyFinance, a student/personal portfolio app for account aggregation, transaction categorization, budgeting and cash-flow analytics; Sandbox testing only.” Do not invent a registered company, business revenue or customers. Use the personal/developer/testing option if the form offers one.

## 2. Find the keys

Open **Build → Sandbox** in the dashboard. Sandbox Studio displays your Sandbox API keys. Depending on the dashboard version, an **API Keys** page may also be available under Build. You need:

| Plaid dashboard value | MyFinance setting |
| --------------------- | ----------------- |
| client_id             | PLAID_CLIENT_ID   |
| Sandbox secret        | PLAID_SECRET      |

Choose the Sandbox secret, never a Production secret. A Link bank-login username/password such as user_good/pass_good is a test institution login, not your application's API key.

## 3. Save privately

In a local checkout, run `npm run env:init` once to create ignored `.env`, then fill these settings in that file:

```dotenv
PLAID_MODE=sandbox
PLAID_ENV=sandbox
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
```

In a Codex Cloud environment, use its private environment-variable/secret fields instead. These credentials must not be added to GitHub source files, PR comments, screenshots or chat messages. Normal mock CI does not need the keys; don't add GitHub Actions secrets unless setting up a separate private Sandbox workflow deliberately.

Keep the generated TOKEN_ENCRYPTION_KEY and SYNC_SERVICE_SECRET settings. Node and Go must share the same values. Restart the app/services after changing their environment. Disconnect mock Items while still in mock mode first, or use a fresh database for Sandbox, so modes are not mixed.

## 4. Verify the application

For an interactive test, start web/Go/PostgreSQL, register, choose **Connect institution**, then **Open Plaid Sandbox Link**. Select a non-OAuth test institution such as First Platypus Bank. Default test credentials are `user_good` / `pass_good`. Complete Link, choose Sync, and allow initial transaction data time to initialize. Disconnect when finished.

For the automated backend test, create a separate PostgreSQL database named `myfinance_test`, set TEST_DATABASE_URL privately, migrate it, and run:

```bash
# Load private .env before using its variables in shell commands.
set -a
. ./.env
set +a
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
npm run test:sandbox
```

Requires Go on PATH. The test creates a temporary app user, calls real Sandbox token/account endpoints, starts an isolated Go service, checks durable sync/cursor progress and disconnects the remote Item. It deletes its synthetic user after successful remote cleanup; encrypted recovery state is retained if disconnection fails. It does not truncate your database or use Production.

## If signup or access is blocked

Keep PLAID_MODE=mock while resolving account access. If the signup form requires an option you cannot truthfully satisfy, report the field/options without exposing credentials; don't apply for a paid plan to bypass it. The existing implementation and offline tests remain usable. No live Sandbox success should be claimed until the smoke test has actually passed.

Official sources: [Sandbox overview](https://plaid.com/docs/sandbox/), [Sandbox Studio](https://plaid.com/docs/sandbox/studio/), [Quickstart](https://plaid.com/docs/quickstart/). New accounts receive Sandbox access by default; see [Plaid CLI account setup](https://plaid.com/docs/resources/cli/#getting-started).

The completed backend smoke used transient environment credentials and disconnected its temporary Item successfully. It does not establish a hosted Link popup pass. Rotate any secret shared in chat, keep the replacement private and configure it locally using the settings above.
