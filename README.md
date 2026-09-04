# MYDAN / میدان — Global Two-Sided Trade Marketplace

A **real, working commercial marketplace**, not a mockup. Every page exists with its real
fields, every form writes to a real database, every link resolves, and permissions are
enforced server-side.

B2B wholesale · B2C retail · C2C · manufacturer→distributor · import/export · services ·
RFQ/procurement · supplier discovery · local & cross-border.

---

## Quick start

```bash
npm install
node src/db/seed.js      # create + populate the database (idempotent)
node server.js           # http://localhost:3000
node test/e2e.js         # 188-check acceptance suite (server must be running)
```

**Seeded accounts** — password `Mydan!2026` for all, or passwordless OTP
(the code is printed to the server console and stored in `otp_challenges`).

| Role | Login | Notes |
|---|---|---|
| Admin | `+905000000001` | full admin panel, all sections |
| Seller | `+905000000010` | Zarrin Saffron (Gold plan, KYB approved) |
| Seller | `+905000000011` | Anatolia Textile (Silver plan) |
| Seller | `+905000000012` | Gulf Polymer (Platinum plan) |
| Buyer | `+905000000032` | Nikpour Trading |
| Buyer | `+905000000030` | Atlas Import BV (English UI) |

---

## Architecture

A **modular monolith** with hard domain boundaries — Express + EJS server-side rendering.

```
server.js                 process entry, graceful shutdown
src/app.js                composition root: security headers, sessions, layout
                          resolution, router mounting, 404/500, ops endpoints
src/db/
  schema.sql              70 tables / 709 columns — the full domain model
  index.js                DB gateway (the single Postgres swap-in point)
  seed.js                 reference data + realistic commercial content
src/middleware/context.js locale · theme · currency · user · nav · view helpers
src/lib/
  i18n.js                 4 locales, RTL/LTR, number/money/date formatting
  themes.js               4 themes as design-token sets
  helpers.js              trust score, profile completion, entitlements,
                          contact gating, audit, notify, analytics
src/modules/              one router per bounded context (10 modules, 178 routes)
  auth · catalog · seller · buyer · messaging · trade · account · admin · cms · api
src/views/                85 EJS templates in 11 domain folders
public/css/app.css        the whole design system, driven by CSS custom properties
```

### Why SQLite instead of PostgreSQL

The spec asks for PostgreSQL; PostgreSQL is not installable in this sandbox. The app runs
on SQLite (`better-sqlite3`) **behind a single gateway module**, `src/db/index.js`, which
exposes a pg-shaped `all / get / run / tx` API. The schema uses Postgres-compatible column
semantics. Porting means rewriting that one file plus `AUTOINCREMENT`→`SERIAL`; no module,
route or view touches the driver directly.

The same isolation applies to the other infra the spec names: Redis/queues/S3/WebSockets
are replaced by in-process equivalents (synchronous handlers, local `/uploads`, and HTTP
long-poll chat via `GET /api/v1/messages/:id?after=`) at clearly marked seams.

---

## What is implemented

**Identity & trust** — passwordless OTP login (single-use, TTL, attempt-capped), optional
password login with anti-enumeration, session log & device list, onboarding with role
choice, KYC (individual) and KYB (company) cases with document metadata, reviewer
decisions and a full event trail, dynamic trust score, rule-based profile-completion
scoring.

**Catalog** — 55-category tree, dynamic attribute engine (35 typed attributes: select,
decimal, boolean, integer, text — rendered and validated per category), 7-step listing
wizard with draft save and resume, product detail pages, price/stock update with full
history, status history, boost/ladder promotion, seller storefronts, faceted search,
supplier & buyer directories.

**Trade** — RFQ/buy requests, quote issuance, **multi-version negotiation** (counter-offers
chain by `parent_quote_id`, losing quotes auto-reject on award), retail cart & checkout,
orders with a state machine and status history, **escrow payments with idempotency keys**
and integer-minor-unit money, shipments, wallet, disputes, reviews.

**Engagement** — real-time-ish messaging with product/RFQ context, CRM-lite (lists,
pipeline statuses, notes), bookmarks, follows, stories, notifications, membership plans →
entitlements → contact-access gating, ad campaigns with click tracking.

**Admin** — 18 sections / 47 routes: dashboard KPIs, users & roles, KYC queue, listing and
RFQ moderation, category & attribute CRUD, localization (languages, currencies, countries,
units, translations), plans, ads, orders & payments, moderation (reports, reviews,
disputes), support, CMS, settings & feature flags, plugin manager with manifest
validation, audit log, health.

**Platform** — 4 locales (fa/en/tr/ar) with correct RTL, 4 themes, 6 currencies, feature
flags, plugin registry, SEO (`sitemap.xml` with hreflang, `robots.txt`, canonical, OG),
GDPR/KVKK privacy centre with data export and deletion, `/healthz` `/readyz` `/metrics`.

---

## Verification

Two independent gates, both green:

**Link crawler** — breadth-first over the authenticated site:

```
visited 1722   ok 1722   bad 0
```

Zero dead links, zero 404s, zero 500s across every reachable page.

**Acceptance suite** (`node test/e2e.js`) — 188 checks in 28 groups, asserting against
the database rather than the HTML:

```
RESULT: 188/188 checks passed
```

It covers, among others: every public and private page renders; detail pages resolve real
records; all 4 locales emit the correct `dir`; themes emit distinct palettes; anonymous
users are redirected and non-admins get 403 on both admin reads *and* writes; OTP is
single-use; wrong passwords fail; forms persist to the correct columns; the wizard creates
a real draft; quote versioning and award logic; a seller **cannot** accept his own quote;
checkout empties the cart and creates line items; **paying twice creates exactly one
payment intent**; an unrelated user cannot read someone else's order or chat thread; the
bookmark API 401s anonymously; admin moderation writes status history + audit log +
notification; invalid or unreasoned moderation decisions are refused; entitlements are
granted from plan features; referential integrity holds; passwords are all bcrypt hashes;
security headers are present.

---

## Scale

| | |
|---|---|
| Routes | **178** (100 GET, 78 POST) |
| Views | **85** EJS templates |
| DB tables / columns | **70** / **709** |
| Domain modules | 10 |
| Server code | ~4,000 lines |
| Templates | ~3,400 lines |
| Design system | 414 lines of CSS |
| Locales / themes / currencies | 4 / 4 / 6 |
| Acceptance checks | 188 passing |
| Crawled URLs | 1,722, zero broken |

---

## Known gaps vs. the original spec

Stated plainly rather than papered over:

- **Stack substitution.** The spec names TypeScript/NestJS/Next.js/Postgres/Redis/S3 in a
  monorepo. This is a JavaScript Express+EJS monolith on SQLite — the same domains, module
  boundaries and behaviour, different runtime. Justified above.
- **Chat is long-poll, not WebSocket.**
- **Notifications are in-app only**; email/SMS/push have no provider wired (the
  `notifications` table already carries a `channel` column for it).
- **Payments are a mock provider.** The escrow state machine, idempotency and ledger are
  real; no gateway is connected.
- **Plugins are a managed registry** (install/enable/disable with manifest validation), not
  a sandboxed runtime that executes third-party code.
- **Two catalog images are missing** (hero banner and the medical listing) — a
  generation-quota limit, not a code issue; those listings fall back to the placeholder.
- No automated visual regression testing — no headless browser was available in the
  sandbox.
