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
for validation and [OpenAPI](https://www.openapis.org/) documentation.

There is no build step — Node runs the TypeScript directly. See
[No build step](#no-build-step) below.

### Prerequisites

- A recent version of git (e.g. `brew install git` on a Mac)
- Node **26.13.0**, the version in `.nvmrc`. Most Node version managers read that file
  and should work. Two need a one-time setting before they will:
  - [mise](https://mise.jdx.dev/): run
    `mise settings add idiomatic_version_file_enable_tools node`
  - [asdf](https://asdf-vm.com/): add `legacy_version_file = yes` to `~/.asdfrc`

  Or install Node 26.13.0 any other way you like. `node --version` should print
  `v26.13.0`.

### Setup

    $ npm install
    $ npm run db:migrate

Optionally load development seed data (two clients, two products, two services, and two
Acme invoices with five line items between them). It is safe to re-run and will not
duplicate rows:

    $ npm run seed

Then start the server:

    $ npm start

Or, to restart automatically whenever a file changes:

    $ npm run dev

The server listens on port 3000. To use another port, set `PORT`, e.g.
`PORT=4000 npm start`.

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

Errors are one shape throughout, so a consumer can handle every failure with one code
path: `{"detail": "..."}` for a single failure and `{"detail": [{"type", "loc",
"msg"}]}` for validation.

| Status | When                                                   |
| ------ | ------------------------------------------------------ |
| `400`  | A malformed path or query parameter, or malformed JSON |
| `404`  | No row with that id, or no such route                  |
| `409`  | A row is still referenced by another                   |
| `422`  | A body that parses but breaks a rule                   |

### Tests

To run the suite of tests:

    $ npm test

To run a single test file:

    $ npm test -- tests/line-items.test.ts

To type-check:

    $ npm run typecheck

To lint:

    $ npm run lint

To check formatting, or to fix it:

    $ npm run format:check
    $ npm run format

## Notes

### The stack

| Layer             | Tool                                                 |
| ----------------- | ---------------------------------------------------- |
| Language          | TypeScript                                           |
| Runtime           | Node.js (ESM, native type stripping — no build step) |
| Version manager   | Any that reads `.nvmrc`                              |
| Dependencies      | npm (`package-lock.json`)                            |
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
`package-lock.json` is committed, so `npm install` installs the same versions everywhere.

There is one `overrides` entry, forcing `esbuild` to 0.25.12. `drizzle-kit` still depends
on the deprecated `@esbuild-kit/*` shims, which pin esbuild 0.18 and so drag in
GHSA-67mh-4wv8-2f99 — the advisory about esbuild's development server accepting requests
from any origin. Nothing here runs that server; drizzle-kit uses esbuild only to
transpile `drizzle.config.ts`. The override is there so `npm audit` is clean and stays
useful as a signal, and 0.25.12 is the version Vite already resolves, so it adds nothing
to the tree. Drop it once drizzle-kit moves off the shims.

### Node version

`.nvmrc` is the single source of truth, and pins **Node 26.13.0**.

Node 26 (`Lithium`) became Active LTS on 2026-10-28, which is the same day Node 24
(`Krypton`) moved to Maintenance. 24 now receives only critical fixes, and nothing in
this stack blocks 26. Node 25 is not an option — it reached end of life in June 2026 and
falls outside Vitest 5's `engines` range.

`better-sqlite3` is built on Node-API and ships prebuilt binaries for all eight
supported platforms inside its own tarball, so there is no native rebuild on a Node major
upgrade and no compiler needed to install this project — as long as install scripts are
skipped. See [Install scripts are skipped](#install-scripts-are-skipped).

### Install scripts are skipped

`.npmrc` sets `ignore-scripts=true`, so a plain `npm install` never runs a dependency's
install script. `npm start`, `npm test` and `npm run` are unaffected.

Nothing in this project needs a postinstall script, and one package is actively harmed by
running one. `better-sqlite3` ships Node-API prebuilds for every platform, but it also
ships the `binding.gyp` it would need for a source build — and npm reacts to the presence
of that file by running `node-gyp rebuild`, which wants Python and a C++ toolchain this
project otherwise has no use for. Without them the install fails outright, even though
the binary it was about to compile is already sitting in `node_modules/better-sqlite3/prebuilds/`.

esbuild, the only other dependency with a postinstall, resolves its platform binary
through `optionalDependencies` and does not need one either.

### No build step

Node's TypeScript type stripping is stable, so `npm start` is just `node src/server.ts`.
There is no `tsc` build, no `tsx`, no `dist/`, and nothing to keep in sync. `tsc` is
still installed, but only as a type checker — `npm run typecheck` runs `tsc --noEmit`, and
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
  declarative — the route tables, the status-code dispatch — and each reads as one list.
  Length here is a review question, not a lint one.

Inside `tests/`, the `no-unsafe-*` family is off, because `@types/supertest` declares
`Response.body` as `any` and every HTTP assertion would trip it. The narrowing those
rules want is what the tests already do where it counts: success bodies are round-tripped
through their Zod response schema, which is a stronger check because it runs.

### Where the domain logic lives

Drizzle is a query builder. It has no model hooks, no validations and no computed
properties, so the validations and computed properties an ORM with model hooks would
carry live in `src/domain/` instead:

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
turning a free line into a charged one.

This is guarded three ways: `prefer-nullish-coalescing` and `strict-boolean-expressions`
fail `npm run lint` on the wrong spelling, `tests/pricing.test.ts` asserts the
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

`src/api/route.ts` is the small adapter that makes that work. Express has no way to bind
a response schema to a route, so one `route()` declaration both mounts an Express
handler and records an OpenAPI operation. Routes are values in a plain array, so
`openapi.ts` cannot document an endpoint that is not mounted and `app.ts` cannot mount
one that is not documented.

Swagger UI's assets are served straight out of `swagger-ui-dist`. The usual wrapper,
`swagger-ui-express`, was last published in May 2024 and its only dependency is an
unbounded `"swagger-ui-dist": ">=5.0.0"`, which would mean one of this project's
dependencies is whatever that package published most recently.

### Field naming

The JSON API is **camelCase** — `priceCents`, `netDays`, `dueDate`, `totalCents`. A
deliberate choice in favour of idiomatic TypeScript.

The database is unaffected. `src/db/schema.ts` declares camelCase properties and the
Drizzle handle is created with `casing: 'snake_case'`, so the SQL columns stay snake_case
— `price_cents`, `net_days`, `client_id` — and there is no mapping layer anywhere in
between. `drizzle.config.ts` sets the same option, and the two must agree or the
generated SQL and the runtime queries will disagree about column names.

### Deliberate schema decisions

**`clients.email` is not unique.** Two subsidiaries can share one accounts-payable
address, so a duplicate `POST` is a `201` rather than a `409`. `tests/clients.test.ts`
pins that.

**Foreign key actions.** Line items cascade from their invoice, so deleting an invoice
takes its line items with it. Invoices restrict on their client, so deleting a client
that still has invoices is a `409`.

**`note` and `description` are `null`, not `""`.** Both columns are genuinely nullable,
so `null` is the honest serialisation.

**A `quantity` of zero or below, a negative `priceCents` and a negative
`priceOverrideCents` are all accepted.** Tightening any of them would be a new business
rule, so each is left to the caller.

**There is no `PUT`.** `PATCH` with a partial body, accepting an explicit `null` for
nullable columns, expresses everything a `PUT` could, and shipping both would mean two
update paths to keep from diverging.

### Migrations

`npm run db:generate` runs `drizzle-kit generate`, writing versioned SQL into `drizzle/`
along with its metadata. Both are committed, and the SQL is the review artifact.

`drizzle-kit push` is deliberately not used. It mutates the database with no migration
file, so there would be nothing to review and nothing for the tests to replay.

`npm run db:migrate` applies them through Drizzle's programmatic migrator in
`src/db/migrate.ts`, which the test suite also calls in-process against its in-memory database. That means a
broken migration fails `npm test`, not just the deploy.

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
  a raw `UPDATE` will not touch it.
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
