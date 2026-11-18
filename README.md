# Mandala

A calm daily mandala to colour. Everyone gets the same mandala each day
(like Wordle), and all progress stays on the device: there is no database.

- `/`: today's mandala, and nothing else. Tap pieces to colour them. Choose how
  many **lines of symmetry** help you: `off` colours one piece by hand, and the
  maximum fills every matching piece at once.
- `/admin`: pattern explorer with past and upcoming days and seeds. It is
  protected by `ADMIN_PASSWORD`.

## How the pattern works

`generateMandala(date, seed)` in `src/lib/mandala/` is a pure, deterministic
function: `hash("v1|seed|date")` seeds a PRNG that picks the symmetry
(6–16-fold), ring radii, a motif per ring and a soft OKLCH palette. It returns
one segment's SVG shapes plus their rotated placements.

`SymmetryIndex` (`symmetry.ts`) finds which pieces a tap fills: the piece's
orbit under the dihedral group D_k for the chosen k (a divisor of the
mandala's symmetry), or every identical piece at full symmetry.

> **Changing the generator changes what players see.** The golden-fingerprint
> test in `generate.test.ts` fails on any such change. If it is intended, bump
> `MANDALA_VERSION` and update the snapshot with `npx vitest -u`.

## Develop

```bash
npm install
npm run dev            # http://localhost:3000 and /admin (open in dev)
npm test               # unit and component tests (Vitest)
npm run test:coverage
npm run lint && npm run typecheck && npm run format:check
npm run build && npm run e2e   # Playwright against the production build
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main`
and on pull requests.

## Database (Neon)

Colouring stays on the device. The database holds only **anonymous activity**
for the admin page: a random per-device UUID and one row per device, day and
mode (time spent, progress, symmetry setting, finished or not). There are no
accounts, emails, IPs or user agents.

| Object                | What it is                                                 |
| --------------------- | ---------------------------------------------------------- |
| `devices`             | Anonymous install ID, first and last seen                  |
| `plays`               | One row per device per day per mode, upserted as they play |
| `daily_activity` view | Players, finishers, average time and progress per day      |
| `symmetry_usage` view | How often each lines-of-symmetry setting is used           |
| `schema_migrations`   | Applied migrations and their checksums (managed)           |

### Migrations

Plain SQL files in `db/migrations/`, named `NNNN_name.sql`, applied in order
by a small forward-only runner (`db/migrator.ts`):

- each migration runs in a transaction with its bookkeeping row, so a failure
  rolls back cleanly (start a file with `-- migrate:no-transaction` for things
  like `CREATE INDEX CONCURRENTLY`);
- applied files are checksummed, so **never edit an applied migration**:
  add a new one;
- an advisory lock prevents two runs migrating at once.

```bash
cp .env.example .env.local        # add your Neon connection strings
npm run db:status                 # ✓ applied  · pending  ✗ edited  ? unknown
npm run db:migrate                # apply pending migrations
npm run db:new -- add_streaks     # create db/migrations/0002_add_streaks.sql
```

Migrations use `DATABASE_URL_UNPOOLED` (a direct connection), falling back to
`DATABASE_URL`. The tests run every migration against an in-memory Postgres
(PGlite), so no database is needed for `npm test`.

**Production:** add `DATABASE_URL_UNPOOLED` as a GitHub Actions secret. CI
then migrates the production database after each push to `main`, once the
checks and end-to-end tests pass. Until the secret exists, that job is
skipped.

## Deploy (Vercel)

Import the repo; Vercel detects Next.js. Set the production branch to `main`
and set the **`ADMIN_PASSWORD`** environment variable. Without it, `/admin`
returns 404 in production. Add the Neon integration (Vercel → Storage) to get
`DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
Sign in to `/admin` with any username and that password.
