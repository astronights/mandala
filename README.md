# Mandala

A calm daily mandala to colour and draw. Everyone gets the same mandala each day
(like Wordle), and all progress stays on the device.

## Generator

`generateMandala(date, seed)` in `src/lib/mandala/` is a pure, deterministic
function: `hash("v1|seed|date")` seeds a PRNG that picks the symmetry
(6–16-fold), ring radii, a motif per ring (petal, lotus, leaf, teardrop,
scallop, dots, diamond, rays) and a soft OKLCH palette.

It returns SVG shapes for one segment plus their rotated placements. Each
placement belongs to a *group*; filling a group colours that area in every
segment at once.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000/preview
npm test
```
