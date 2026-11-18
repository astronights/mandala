# Mandala

A calm daily mandala to colour, made for phones. Like Wordle, everyone gets
the same one each day, but it's a ritual, not a puzzle: no score, no wrong
answers. Colouring stays on your device. It can be added to the home screen.

- `/`: today's mandala, and nothing else. Tap pieces to colour them, pinch to
  zoom in on small pieces, drag to move around. Choose how many **lines of
  symmetry** help you: `off` colours one piece at a time, and the maximum fills
  every matching piece at once.
- `/admin`: **Activity** (players, finishers, time, symmetry use, completion by
  pattern) and **Patterns** (past and upcoming days, seed explorer). Behind a
  passcode screen: set `ADMIN_PASSWORD` in Vercel, enter it once, and that
  device stays signed in for a year. Changing the passcode signs every device
  out. Five wrong attempts lock sign-in for 15 minutes.

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
npm run build && npm run e2e   # Playwright against the production build (desktop + phone)
npm run icons          # re-render the home-screen icons from the generator
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main`
and on pull requests.

## Activity tracking

As someone colours, the app sends `/api/play` an anonymous report: a random
device ID, today's date, the mode, time spent (gaps over 30 s don't count),
how much is coloured, the symmetry setting and whether it's finished. Reports
are batched (every 20 s at most, plus when the page is hidden) and never block
play. Nothing is sent for just opening the page, or at all when the browser
signals Global Privacy Control or Do Not Track. Without a database, the
endpoint accepts reports and drops them.

## Database (Neon)

Colouring stays on the device. The database holds only **anonymous activity**
for the admin page: a random per-device UUID and one row per device, day and
mode (time spent, progress, symmetry setting, finished or not). There are no
accounts, emails, IPs or user agents.

| Object                 | What it is                                                 |
| ---------------------- | ---------------------------------------------------------- |
| `devices`              | Anonymous install ID, first and last seen                  |
| `plays`                | One row per device per day per mode, upserted as they play |
| `daily_activity` view  | Players, finishers, average time and progress per day      |
| `symmetry_usage` view  | How often each lines-of-symmetry setting is used           |
| `daily_mandalas`       | Each day's seed, generator version and pattern summary     |
| `daily_overview` view  | Each day's pattern alongside its activity                  |
| `admin_login_failures` | Timestamps of wrong passcodes, for the lockout             |
| `schema_migrations`    | Applied migrations and their checksums (managed)           |

`daily_mandalas` is filled by the first play of each day and by a daily
Vercel Cron job (`vercel.json` → `/api/cron/record-day`, which needs
`CRON_SECRET`), so days nobody played are recorded too. It also has
`override_seed` and `override_note` columns, reserved for curating a day
later; the app doesn't read them yet.

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
`DATABASE_URL` and `DATABASE_URL_UNPOOLED`, and set `CRON_SECRET` for the daily
job. See `.env.example` for every variable.
Sign in to `/admin` with any username and that password.
