# Accounts Receivable

Welcome to the Accounts Receivable system! This system is responsible for creating,
sending, and tracking invoices sent to clients so we can be paid for our products and
services.

> **Status: domain complete, API only.** All five tables — clients, products, services,
> invoices, and line items — are exposed as full CRUD JSON endpoints under `/api`, with
> interactive documentation at `/api/docs`. There is no rendered frontend; the API is the
> entire application. Invoice totals, line-item unit prices and subtotals, and due dates
> are computed and returned.

## Getting started

This project is an [Express](https://expressjs.com/) 5 application written in
[TypeScript](https://www.typescriptlang.org/). It uses [SQLite](https://sqlite.org/) for
the database and [Drizzle ORM](https://orm.drizzle.team/), with [Zod](https://zod.dev/)
for validation and [OpenAPI](https://www.openapis.org/) documentation. Node versions are
managed with [asdf](https://asdf-vm.com/).

There is no build step — Node runs the TypeScript directly. See
[No build step](#no-build-step) below.

### Prerequisites

Before you get started, be sure to:

- Have a recent version of git installed (e.g. `brew install git` on a Mac)
- Have asdf installed, with the nodejs plugin (`asdf plugin add nodejs`)

### Initial setup

    $ ./setup.sh

That installs the pinned Node, installs dependencies, and applies migrations. If you
would rather run the steps yourself:

1. Install the Node version this project pins:

        $ asdf install
        $ asdf reshim nodejs 26.13.0

2. Install dependencies:

        $ npm ci --ignore-scripts

   (Use the npm that came with the Node above. If you have another Node manager
   installed — nodenv, nvm, fnm, Volta, Homebrew — its npm may well be the one on your
   `PATH`, because asdf's own npm wrapper searches `PATH` with the asdf shims removed.
   `setup.sh` sidesteps the whole problem by addressing
   `"$(asdf where nodejs)/bin/npm"` directly.)

3. Apply migrations:

        $ node src/db/migrate.ts

Optionally load development seed data (two clients, two products, two services, and two
Acme invoices with five line items between them):

    $ node src/seed.ts

That command is safe to re-run; it will not duplicate rows.

Then start the server:

    $ ./run.sh

And you should be able to browse the API documentation:
[http://localhost:3000/api/docs](http://localhost:3000/api/docs)

> The API is unauthenticated. This application has no users at all.

### The API

Everything is mounted under `/api`. Collections are bare JSON arrays and single
resources are bare JSON objects — there is no envelope.

| Method   | Path                                      | Returns                                              |
| -------- | ----------------------------------------- | ---------------------------------------------------- |
| `GET`    | `/api/health`                             | `200` — the service is up, and what it is running on |
| `GET`    | `/api/docs`                               | `200` — Swagger UI                                   |
| `GET`    | `/api/openapi.json`                       | `200` — the OpenAPI 3.1 document                     |
| `GET`    | `/api/clients`                            | `200` — every client, in id order                    |
| `POST`   | `/api/clients`                            | `201` + `Location`                                   |
| `GET`    | `/api/clients/:id`                        | `200`                                                |
| `PATCH`  | `/api/clients/:id`                        | `200`                                                |
| `DELETE` | `/api/clients/:id`                        | `204`, or `409` if the client still has invoices     |
| `GET`    | `/api/products` · `/api/services`         | `200`                                                |
| `POST`   | `/api/products` · `/api/services`         | `201` + `Location`                                   |
| `GET`    | `/api/products/:id` · `/api/services/:id` | `200`                                                |
| `PATCH`  | `/api/products/:id` · `/api/services/:id` | `200`                                                |
| `DELETE` | `/api/products/:id` · `/api/services/:id` | `204`, or `409` if still on a line item              |
| `GET`    | `/api/invoices?clientId=`                 | `200` — with `dueDate` and `totalCents`              |
| `POST`   | `/api/invoices`                           | `201` + `Location`                                   |
| `GET`    | `/api/invoices/:id`                       | `200`                                                |
| `PATCH`  | `/api/invoices/:id`                       | `200`                                                |
| `DELETE` | `/api/invoices/:id`                       | `204` — takes its line items with it                 |
| `GET`    | `/api/line-items?invoiceId=`              | `200` — with `unitPriceCents` and `subtotalCents`    |
| `POST`   | `/api/line-items`                         | `201` + `Location`                                   |
| `GET`    | `/api/line-items/:id`                     | `200`                                                |
| `PATCH`  | `/api/line-items/:id`                     | `200`                                                |
| `DELETE` | `/api/line-items/:id`                     | `204`                                                |

Response shapes. The derived fields are returned so that no consumer has to recompute
them:

```
Client    { id, name, email, createdAt, updatedAt }
Product   { id, name, priceCents, createdAt, updatedAt }
Service   { id, name, priceCents, createdAt, updatedAt }
Invoice   { id, clientId, netDays, note, dueDate, totalCents, createdAt, updatedAt }
LineItem  { id, invoiceId, productId, serviceId, priceOverrideCents, quantity,
            description, unitPriceCents, subtotalCents, createdAt, updatedAt }
```

Errors use the same shape as the Django port, which in turn is Pydantic's, so a consumer
can handle either port's failures with one code path: `{"detail": "..."}` for a single
failure and `{"detail": [{"type", "loc", "msg"}]}` for validation.

| Status | When                                                   |
| ------ | ------------------------------------------------------ |
| `400`  | A malformed path or query parameter, or malformed JSON |
| `404`  | No row with that id, or no such route                  |
| `409`  | A row is still referenced by another                   |
| `422`  | A body that parses but breaks a rule                   |

### Tests

To run the suite of tests:

    $ ./test.sh

To run a single test file:

    $ ./test.sh tests/line-items.test.ts

To type-check, lint and check formatting:

    $ ./lint.sh

## Notes

### The stack

| Layer             | Tool                                                 |
| ----------------- | ---------------------------------------------------- |
| Language          | TypeScript                                           |
| Runtime           | Node.js (ESM, native type stripping — no build step) |
| Version manager   | asdf                                                 |
| Dependencies      | npm (`package-lock.json`, `npm ci`)                  |
| HTTP framework    | Express 5                                            |
| ORM               | Drizzle ORM                                          |
| Migrations        | drizzle-kit                                          |
| SQLite driver     | better-sqlite3                                       |
| Validation        | Zod 4                                                |
| API documentation | zod-openapi + Swagger UI                             |
| Test runner       | Vitest                                               |
| HTTP test client  | supertest                                            |
| Type checker      | `tsc --noEmit`                                       |
| Lint              | oxlint (type-aware)                                  |
| Format            | Prettier                                             |

Every dependency in `package.json` is pinned exactly, with no `^` or `~`.
`package-lock.json` is committed and `setup.sh` installs with `npm ci --ignore-scripts`.

There is one `overrides` entry, forcing `esbuild` to 0.25.12. `drizzle-kit` still depends
on the deprecated `@esbuild-kit/*` shims, which pin esbuild 0.18 and so drag in
GHSA-67mh-4wv8-2f99 — the advisory about esbuild's development server accepting requests
from any origin. Nothing here runs that server; drizzle-kit uses esbuild only to
transpile `drizzle.config.ts`. The override is there so `npm audit` is clean and stays
useful as a signal, and 0.25.12 is the version Vite already resolves, so it adds nothing
to the tree. Drop it once drizzle-kit moves off the shims.

### Node version

`.tool-versions` is the single source of truth, and pins **Node 26.13.0**.

Node 26 (`Lithium`) became Active LTS on 2026-10-28, which is the same day Node 24
(`Krypton`) moved to Maintenance. The Rails app this ports pins `nodejs 24.14.1`, so
this is a deliberate step off the family's shared major: 24 now receives only critical
fixes, and nothing in this stack blocks 26. Node 25 is not an option — it reached end of
life in June 2026 and falls outside Vitest 5's `engines` range.

`better-sqlite3` is built on Node-API and ships prebuilt binaries for all eight
supported platforms inside its own tarball, so there is no native rebuild on a Node major
upgrade and no compiler needed to install this project — as long as you install with
`--ignore-scripts`. See [Installing with `--ignore-scripts`](#installing-with---ignore-scripts).

### Installing with `--ignore-scripts`

`setup.sh` installs with `npm ci --ignore-scripts`, and so should you.

Nothing in this project needs a postinstall script, and one package is actively harmed by
running one. `better-sqlite3` ships Node-API prebuilds for every platform, but it also
ships the `binding.gyp` it would need for a source build — and npm reacts to the presence
of that file by running `node-gyp rebuild`, which wants Python and a C++ toolchain this
project otherwise has no use for. Without them the install fails outright, even though
the binary it was about to compile is already sitting in `node_modules/better-sqlite3/prebuilds/`.

esbuild, the only other dependency with a postinstall, resolves its platform binary
through `optionalDependencies` and does not need one either.

### No build step

Node's TypeScript type stripping is stable, so `./run.sh` is just `node src/server.ts`.
There is no `tsc` build, no `tsx`, no `dist/`, and nothing to keep in sync. `tsc` is
still installed, but only as a type checker — `./lint.sh` runs `tsc --noEmit`, and
nothing ever compiles.

Three consequences are worth knowing before editing:

- **Relative imports end in `.ts`** — `import { createApp } from './app.ts'`. That is
  the real file on disk, which is what Node resolves. `allowImportingTsExtensions` tells
  `tsc` to accept it.
- **`erasableSyntaxOnly` is on, and is load-bearing.** Node 26 is strip-only;
  `--experimental-transform-types` was removed. `enum`, `namespace` with runtime code,
  and constructor parameter properties cannot be stripped and are runtime errors, so
  this flag turns each of them into a compile error instead. It has already earned its
  place once — it caught a `constructor(private readonly log: ...)` in `src/seed.ts`,
  which is why that file uses a closure rather than a class.
- **`tsconfig.json` is ignored at runtime**, so there are no `paths` aliases. All
  imports are relative.

### TypeScript and lint

TypeScript is pinned to **7.0.2**, the native compiler, and linting is **oxlint** with
`--type-aware` rather than ESLint with `typescript-eslint`.

Those two choices are one choice. `typescript-eslint` declares a peer range of
`typescript >=4.8.4 <6.1.0`, so there is no release of it that can load TypeScript 7 at
all; picking TS 7 means picking something else to lint with. oxlint's type-aware mode is
backed by `tsgolint`, which runs on the same compiler.

The rule that mattered most in making that call is
`typescript/prefer-nullish-coalescing`, which is what stops the bug described under
[the override](#the-override-and-why--matters) from being reintroduced. It was verified
to work under `oxlint --type-aware`, along with `strict-boolean-expressions`, before
committing to this combination.

`.oxlintrc.json` turns on the `correctness`, `suspicious`, `pedantic` and `perf`
categories and then switches a handful of rules off, each with its reason written next to
it. The two worth calling out:

- `prefer-readonly-parameter-types` fires on every Drizzle table callback and every
  domain function that takes an options object. It is off by default upstream for the
  same reason.
- `max-lines` and `max-lines-per-function` are off. The longest things here are
  declarative — the route tables, the status-code dispatch — and splitting a list in half
  to get under a counter makes it harder to check against the Rails app it ports.

Inside `tests/`, the `no-unsafe-*` family is off, because `@types/supertest` declares
`Response.body` as `any` and every HTTP assertion would trip it. The narrowing those
rules want is what the tests already do where it counts: success bodies are round-tripped
through their Zod response schema, which is a stronger check because it runs.

### Where the domain logic lives

Drizzle is a query builder. It has no model hooks, no validations and no computed
properties, so everything Rails puts on an `ActiveRecord` model and Django puts on a
`Model` lives in `src/domain/` here instead:

- `pricing.ts` is pure — no Drizzle import, no Express import. The four rules that are
  the whole reason this application exists are plain functions over plain numbers, and
  `tests/pricing.test.ts` exercises them with neither a database nor a request.
- `clients.ts`, `catalog.ts` and `billing.ts` take a database handle and plain input,
  enforce the rules, and return wire-ready records. They never touch `req` or `res`.

That boundary is enforced, not just documented: `.oxlintrc.json` forbids `src/domain/**`
and `src/db/**` from importing `express` or anything under `src/api/`.

### The override, and why `??` matters

A line item bills `priceOverrideCents ?? catalogPriceCents`. **Not `||`.**

`null` means "no override, bill the catalog price". An override of `0` means a free
line, and `||` would treat it as absent and bill the catalog price instead — silently
turning a free line into a charged one. An earlier abandoned Node port of this
application ignored the override entirely, and its single business-logic test asserted
the resulting wrong total rather than catching it.

This is guarded three ways: `prefer-nullish-coalescing` and `strict-boolean-expressions`
fail `./lint.sh` on the wrong spelling, `tests/pricing.test.ts` asserts the
override-of-zero case directly, and `tests/seed.test.ts` asserts the seeded invoice
total of 2,480,000 cents, which reads 2,640,000 if the override is dropped.

### Zod is the source of truth

`src/api/schemas.ts` holds every request and response shape, hand-written rather than
derived from the Drizzle tables with `drizzle-zod`. The shapes genuinely differ:
responses add the derived fields, and requests drop ids and timestamps, so deriving and
then patching would be more code than writing the contract once.

Each schema does three jobs: it validates the request, it validates the response **on
the way out**, and it generates the OpenAPI document. The outbound check is the
interesting one — a handler that drops a field or returns the wrong type fails loudly
rather than shipping a hole in the JSON, which is what makes the response schemas tests
rather than prose. And because the document and the runtime guard read the same objects,
the documentation cannot drift from the API.

`src/api/route.ts` is the small adapter that makes that work. Express has no equivalent
of Django Ninja's `@router.get(..., response=Schema)`, so one `route()` declaration both
mounts an Express handler and records an OpenAPI operation. Routes are values in a plain
array, so `openapi.ts` cannot document an endpoint that is not mounted and `app.ts`
cannot mount one that is not documented.

Swagger UI's assets are served straight out of `swagger-ui-dist`. The usual wrapper,
`swagger-ui-express`, was last published in May 2024 and its only dependency is an
unbounded `"swagger-ui-dist": ">=5.0.0"`, which would mean one of this project's
dependencies is whatever that package published most recently.

### Field naming

The JSON API is **camelCase** — `priceCents`, `netDays`, `dueDate`, `totalCents`.

This diverges from the Rails and Django ports, which are snake_case, so a consumer
cannot move between the ports without remapping keys. It is a deliberate choice in
favour of idiomatic TypeScript.

The database is unaffected. `src/db/schema.ts` declares camelCase properties and the
Drizzle handle is created with `casing: 'snake_case'`, so the SQL keeps the Rails column
names — `price_cents`, `net_days`, `client_id` — and there is no mapping layer anywhere
in between. `drizzle.config.ts` sets the same option, and the two must agree or the
generated SQL and the runtime queries will disagree about column names.

### Deliberate schema decisions

**`clients.email` is not unique.** Rails declares no uniqueness constraint on it, two
subsidiaries can share one accounts-payable address, and adding one would change
observable behaviour: a duplicate `POST` would become a `409` where Rails and the Django
port both return `201`. The abandoned Prisma port added a unique index here silently.
`tests/clients.test.ts` pins the current behaviour.

**Foreign key actions mirror Rails' associations.** Line items cascade from their
invoice, which is `dependent: :destroy`. Invoices restrict on their client, because
Rails declares that association with no `dependent:` option and therefore raises;
deleting a client that still has invoices is a `409` here.

**`note` and `description` are `null`, not `""`.** The Rails columns are genuinely
nullable, so `null` is the honest serialisation. The Django port coerces them to an
empty string via `blank=True`.

### Rails behaviour deliberately not ported

Each of these is commented where someone would otherwise restore it.

1. **The zero-price filter.** `InvoicesController#show` selects line items with
   `where("products.price_cents != 0")`, which silently drops rows whose catalog entry is
   priced at zero out of both the rendered table and the total — even when the row carries
   a non-zero override. That is a bug, not a rule.
2. **`InvoicesHelper#to_money`**, which raises `IndexError` for 1–9 cents and misformats
   10–99. This API returns integer cents and has no formatting layer at all.
3. **`after_action :save_line_items`**, which re-saves every line item on every
   non-index request — a write on `GET`, and again after `destroy`.
4. **HTTP 200 on validation failure.** Rails re-renders the form with a `200`; this API
   returns `422`.
5. **Missing model validations.** Rails has none at all, so a blank name reaches the
   `NOT NULL` constraint and surfaces as a `500`. This API validates and returns `422`.
6. **The `PUT` route.** Rails' `PUT` and `PATCH` dispatch to the identical `update`
   action, so `PUT` is an artifact of the route generator. Shipping both would mean two
   update paths to keep from diverging; `PATCH` with a partial body, accepting explicit
   `null` for nullable columns, expresses everything a `PUT` could.

What Rails permits and this port still permits, on purpose: a `quantity` of zero or
below, a negative `priceCents`, and a negative `priceOverrideCents`. Tightening any of
them would be a new business rule rather than a port of an existing one.

### Migrations

`npm run db:generate` runs `drizzle-kit generate`, writing versioned SQL into `drizzle/`
along with its metadata. Both are committed: the SQL is the review artifact, the same way
`db/schema.rb` and Django's `migrations/` are in the sibling ports.

`drizzle-kit push` is deliberately not used. It mutates the database with no migration
file, so there would be nothing to review and nothing for the tests to replay.

Migrations are applied through Drizzle's programmatic migrator in `src/db/migrate.ts`,
which the test suite calls in-process against its in-memory database. That means a
broken migration fails `./test.sh`, not just the deploy.

### Tests

`src/app.ts` exports `createApp({ db })` and `src/server.ts` is the only place that
opens the real database or calls `.listen()`. That injection is what makes isolation
cheap: `tests/helpers/app.ts` opens `':memory:'`, applies the migrations in-process, and
hands back a supertest agent. Five `CREATE TABLE`s against in-memory SQLite are
sub-millisecond, so every test file gets its own schema and no test can see another's
rows.

Factories are plain functions with a module-level counter for unique names. There is no
Faker: nothing here needs random data, and random data in a test about money is a
liability. `createLineItem` deliberately supplies neither a product nor a service, so the
caller passes exactly one and the product-or-service rule stays testable from both sides.

`tests/schema.test-d.ts` runs under `vitest --typecheck` and guards the other direction
from the response tests: a column added to `src/db/schema.ts` with no matching response
field is a type error, which no runtime test would notice because nothing would ever try
to serialise it.

### Gotchas

- **`@types/better-sqlite3` is at 9.6.0 against a runtime 13.0.3.** `better-sqlite3`
  ships no types of its own and DefinitelyTyped has not kept up, so `skipLibCheck` is on.
- **`$onUpdate` on `updatedAt` fires only through Drizzle.** There is no SQL trigger, so
  a raw `UPDATE` will not touch it. That is the same contract ActiveRecord has, so it is
  a faithful port rather than an oversight.
- **`PRAGMA foreign_keys` is set explicitly** on every connection, in
  `src/db/client.ts`. It is per-connection, is not stored in the database file, and
  better-sqlite3's own default for it has moved across major versions.
- **Drizzle wraps driver errors.** A constraint violation arrives as a Drizzle error with
  the real `SqliteError` on `cause`, so anything inspecting `error.code` has to walk the
  chain. `src/api/errors.ts` does, and `tests/errors.test.ts` pins it — this was a live
  bug that returned `500` for every constraint violation until a test caught it.
- **Timestamps are stored as integer unix seconds** and are UTC by convention. SQLite has
  no date type and stores no timezone, and this API has no users, no sessions and no
  locale, so there is no other timezone it could honestly claim.
