# Original-design browser preview

This preview bundles the same original homepage, authentication styling and navy Chakra dashboard components used by Next.js, with a separate browser-only synthetic API adapter. It is **not a hosted deployment of the Node/Go/PostgreSQL application**. The footer and browser title identify the preview. The adapter is never imported by Next.js.

It opens on the original homepage. Choose Demo App to inspect synthetic CAD transactions and budgets. Dashboard, Transactions, Budget and Profile reuse the original layout/theme. Profile supports simulated connection/repeated sync; Transactions supports filters, category overrides, manual entries and CSV. New descriptions use the same trained Naive Bayes artifact. Reload retains data in sessionStorage; clear this site's session storage or open a fresh tab to reset. There is one sample workspace. Sign-in/registration demonstrate navigation only: passwords are not stored or verified and there is no real multi-user security. Use sample values only.

Build with `npm run preview:build`; serve `preview/dist` with a static HTTP server. Hash routing substitutes for Next navigation only in this bundle. The build clears generated output before copying assets. Homepage screenshots/recording contain synthetic data captured from the restored UI; original image/video positions are preserved.

No Plaid keys, personal financial data, server, Go service or database are included in the bundle. Live backend verification is recorded in docs/VERIFICATION.md; the full application runs through the root Docker Compose setup. Google sign-in and password reset are explicitly unavailable in both interfaces.

The hosted copy is private to its owner. Update it using the existing Site identity. Do not change the backend application to fit static hosting.
