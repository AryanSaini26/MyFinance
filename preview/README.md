# Browser demo

This demo bundles the actual dashboard component and stylesheet with a separate, browser-only synthetic API adapter. It is an interactive walkthrough, **not a hosted deployment of the Node/Go/PostgreSQL application**. The adapter is never imported by Next.js.

It opens with synthetic CAD transactions and budgets. Account simulation, repeat sync, filters, category overrides, manual entries, CSV imports and budgets work within one tab. The same trained Naive Bayes artifact is used for newly added descriptions. Reload retains the demo data in sessionStorage; Reset sample data restores it. Sign-in forms demonstrate the UI only: passwords are not stored or verified and the demo has no real multi-user security. Use sample values only.

Build with `npm run preview:build`; serve `preview/dist` with a static HTTP server. No Plaid keys, personal financial data, server, Go service or database are included in the bundle. Live backend verification is recorded in docs/VERIFICATION.md; the full application runs through the root Docker Compose setup.

The hosted copy is private to its owner. To update it, rebuild from the current source and publish the output through the existing Site identity, rather than changing the main application to fit static hosting.
