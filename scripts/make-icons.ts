/**
 * Renders the app icon from the generator itself and writes:
 *   public/icon.svg, public/icon-192.png, public/icon-512.png, public/apple-icon.png
 *
 * Run with `npm run icons` (bundles this file, then uses Playwright's Chromium).
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { generateMandala, VIEW_RADIUS } from "../src/lib/mandala/generate";

const ICON_DATE = "2026-01-08";
const ICON_SEED = "mandala";
const BG = "#f6f2ea";
const LINE = "#4a453d";

function iconSvg(): string {
  const m = generateMandala(ICON_DATE, ICON_SEED);
  const d = new Map(m.shapes.map((s) => [s.id, s.d]));
  const fill = (group: string) => m.palette.colours[m.suggested[group]].css;
  const paths = m.regions
    .map(
      (r) =>
        `<path d="${d.get(r.shape)}"${r.rotate ? ` transform="rotate(${r.rotate})"` : ""} fill="${fill(r.group)}"/>`,
    )
    .join("");
  const v = VIEW_RADIUS;
  // The mandala fills 78% of the canvas: inside the safe zone for maskable icons.
  const scale = 0.78;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-v} ${-v} ${2 * v} ${2 * v}"><rect x="${-v}" y="${-v}" width="${2 * v}" height="${2 * v}" fill="${BG}"/><g transform="scale(${scale}) rotate(-90)" stroke="${LINE}" stroke-width="3" stroke-linejoin="round">${paths}</g></svg>`;
}

async function main() {
  const svg = iconSvg();
  await writeFile("public/icon.svg", svg);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, size] of [
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
    ["public/apple-icon.png", 180],
  ] as const) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: file, omitBackground: false });
    console.log(`wrote ${file}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
