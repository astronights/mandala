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

## Deploy (Vercel)

Import the repo; Vercel detects Next.js. Set the **`ADMIN_PASSWORD`**
environment variable. Without it, `/admin` returns 404 in production.
Sign in to `/admin` with any username and that password.
