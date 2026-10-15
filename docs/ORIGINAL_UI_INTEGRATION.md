# Original UI integration

## Sources and development history

| Source | Inspected main commit | Reused design |
| --- | --- | --- |
| [MyFinance-Homepage-main](https://github.com/AryanSaini26/MyFinance-Homepage-main) | a7afda3a3bd28a8d6e4f51ee6ac7ac157e1c558d | Dark purple homepage, logo, hero, illustrations, zigzag sections, typography, header/footer and authentication styling |
| [MyFinance-User-nextjs-integration](https://github.com/AryanSaini26/MyFinance-User-nextjs-integration) | 3e0f69ae2951b50654f918a2a874653ab588b35f | Navy Chakra theme, sidebar/navbar, statistic cards, pie/line chart styling, calendar, transaction table/upload layout and profile banner |

Both supplied repositories had only main in the remote branch inventory. Their original clones and upstream history are unchanged. Original design provenance is recorded here and in Git history. Current application branding and social links display Aryan Saini, as requested by the repository owner. No license grant is invented: the user-dashboard LICENSE file was empty. The main backend baseline is separately preserved under src/.

The first v2 dashboard was created before these repositories were supplied. It is retained as non-executable text in docs/reference and in Git history; the live root and dashboard now use the original designs. This records an integration step rather than rewriting past development claims.

## Implemented routes and behavior

- `/`: original homepage, screenshots/video in their original positions.
- `/signin`, `/signup`: original form appearance with secure session-backed API authentication. Email is the identifier; passwords require 12–128 characters. Google login and password recovery are explicitly unavailable rather than simulated in the full application.
- `/dashboard`: original cards, category pie, six-month income/expense chart and calendar. Month/currency controls use actual API data. Hardcoded growth values were replaced with a real previous-month comparison or an empty comparison state.
- `/dashboard/transactions`: original table columns and CSV upload appearance, authenticated transactions, pagination, filters, category overrides and manual entry.
- `/dashboard/budget`: replaces the original Coming Soon placeholder with real category/month/currency targets and spending progress using the same card theme.
- `/dashboard/profile`: retains profile banner and adds account metadata, manual accounts, Sandbox/mock connection, manual sync and disconnect.

The dashboard's original JavaScript/JSX presentation components are retained; typed TypeScript integration/context code connects them to the new API. Chakra 2 preserves the original theme API while working with the tested React 19/Next build. React Router and CRA are not runtime dependencies. Next navigation replaces old cross-site redirects. Fonts are served locally. A native scrolling container replaces an obsolete React-17-only scrollbar dependency without changing sidebar dimensions.

## Security and data boundaries

No browser URL or sessionStorage value selects the application user. The server derives ownership from its session cookie. Old Heroku endpoints and user-ID redirects are removed from the runtime frontend; form errors never log passwords. Workspace refresh generations discard stale responses and logout clears cached financial state. Navbar search is literal, parameterized, owner scoped and length bounded.

Homepage image/video content was recaptured with synthetic records from the restored interface; original personal financial screenshots/recordings are not copied into this branch. The unchanged original upstream repositories remain separate. Unused stock assets were omitted.

The private Site is an interactive **browser-only synthetic preview**, using the same design components but a separate adapter. Its footer/title disclose that boundary. The full Node/Go/PostgreSQL application runs with Docker Compose or the documented native setup. A static-hosting preview is not evidence of backend execution; backend, SQL, browser and real Sandbox results are separately recorded in VERIFICATION.md.

## Branding and usability follow-up

The homepage/dashboard footers now display Aryan Saini, and homepage social links target AryanSaini26/MyFinance and linkedin.com/in/aryansaini26/. The built-in browser-preview profile displays Aryan Saini; authenticated application profiles continue to show the signed-in account identity. Breadcrumbs use real routes, navbar search opens Transactions on Enter/button click, mobile navigation is inert while closed, and profile avatars show identity initials. Marketing text describes implemented Sandbox/CSV/budget behavior without an unverified time-saving guarantee. The original layout, colours and design are retained.

The dashboard now renders from its shared Next.js layout so changing subpages preserves search, reporting month/currency and filters. An end-to-end regression navigates from the overview through navbar search and verifies only matching transaction rows remain. Logout leaves the layout and clears the workspace; the existing delayed-next-user and stale-filter regression tests remain in place.
