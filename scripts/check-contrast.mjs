// SPDX-FileCopyrightText: 2026 Stamp contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Verifies the contrast logic in out/color.js (compile first: npm run compile).
 *
 * Two kinds of checks:
 *  1. Algorithm correctness: readableForeground() must always return whichever
 *     of {light, dark} foreground has the HIGHER contrast — for every input,
 *     including pathological mid-grays.
 *  2. Real-world readability: every shipped palette color and every
 *     auto-generated project color must clear WCAG AA (contrast >= 4.5).
 *
 * Mid-grays (e.g. #808080) sit in a "dead zone" where no foreground reaches
 * 4.5; those are checked for correctness only, not the 4.5 threshold — and the
 * shipped/auto colors are chosen to avoid that zone.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const color = await import(path.join(here, '..', 'out', 'color.js'));
const {
  readableForeground,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  colorFromString,
  DEFAULT_LIGHT_FOREGROUND,
  DEFAULT_DARK_FOREGROUND,
  AUTO_SATURATION,
  AUTO_LIGHTNESS,
  themedBackground,
  hexToHsl,
  hslToHex,
  DARK_LIGHTNESS_CAP,
  DARK_SATURATION_CAP,
} = color;

const AA = 4.5;

function ratioBetween(aHex, bHex) {
  return contrastRatio(relativeLuminance(hexToRgb(aHex)), relativeLuminance(hexToRgb(bHex)));
}

function bestPossible(bgHex) {
  return Math.max(
    ratioBetween(bgHex, DEFAULT_LIGHT_FOREGROUND),
    ratioBetween(bgHex, DEFAULT_DARK_FOREGROUND),
  );
}

// ---- 1. Algorithm correctness across a wide range, including grays ----------
const correctnessSamples = [
  '#000000', '#111111', '#333333', '#555555', '#777777', '#808080',
  '#999999', '#aaaaaa', '#cccccc', '#eeeeee', '#ffffff',
  '#03a9f4', '#cddc39', '#ffeb3b', '#4caf50', '#8bc34a', '#e91e63',
];
for (const bg of correctnessSamples) {
  const fg = readableForeground(bg);
  const chosen = ratioBetween(bg, fg);
  const best = bestPossible(bg);
  assert.ok(
    Math.abs(chosen - best) < 1e-9,
    `readableForeground(${bg}) picked ${fg} (contrast ${chosen.toFixed(2)}) but the better choice gives ${best.toFixed(2)}`,
  );
}
console.log(`✓ readableForeground always selects the higher-contrast text (${correctnessSamples.length} samples)`);

// ---- 2. Shipped palette must clear WCAG AA ----------------------------------
const palette = [
  '#2e7d32', '#1565c0', '#00838f', '#283593', '#6a1b9a',
  '#ad1457', '#c62828', '#ef6c00', '#4e342e', '#37474f',
];
let worstPalette = Infinity;
for (const bg of palette) {
  const fg = readableForeground(bg);
  const ratio = ratioBetween(bg, fg);
  worstPalette = Math.min(worstPalette, ratio);
  console.log(`  palette ${bg} -> ${fg}  contrast ${ratio.toFixed(2)}`);
  assert.ok(ratio >= AA, `Palette ${bg} contrast ${ratio.toFixed(2)} < ${AA}`);
}
console.log(`✓ all ${palette.length} palette colors >= AA (worst ${worstPalette.toFixed(2)})`);

// ---- 3. Auto-generated colors: sweep every hue + realistic names ------------
let worstAuto = Infinity;
let worstHue = -1;
for (let h = 0; h < 360; h++) {
  // Probe every hue at the exact params colorFromString uses.
  const bg = color.hslToHex(h, AUTO_SATURATION, AUTO_LIGHTNESS);
  const ratio = bestPossible(bg);
  if (ratio < worstAuto) {
    worstAuto = ratio;
    worstHue = h;
  }
}
console.log(`  auto-color hue sweep worst case: hue ${worstHue} -> best contrast ${worstAuto.toFixed(2)}`);
assert.ok(worstAuto >= AA, `Some auto-color hue only reaches ${worstAuto.toFixed(2)} (< ${AA}); deepen the lightness`);

for (const name of ['project-1', 'project-2', 'my-app', 'backend', 'frontend', 'vscode-stamp', 'a', '']) {
  const bg = colorFromString(name);
  const fg = readableForeground(bg);
  const ratio = ratioBetween(bg, fg);
  console.log(`  auto "${name}" -> ${bg} / ${fg}  contrast ${ratio.toFixed(2)}`);
  assert.ok(ratio >= AA, `Auto color for "${name}" contrast ${ratio.toFixed(2)} < ${AA}`);
}

// ---- 4. Theme-adapted shades stay readable in BOTH themes -------------------
// The bar actually paints themedBackground(base, mode), so that is what must
// clear AA. Light mode leaves the base unchanged (already verified above); dark
// mode deepens it — verify the deepened shade across the palette and auto hues.
let worstDark = Infinity;
for (const base of palette) {
  const bg = themedBackground(base, 'dark');
  const fg = readableForeground(bg);
  const ratio = ratioBetween(bg, fg);
  worstDark = Math.min(worstDark, ratio);
  console.log(`  dark   ${base} -> ${bg} / ${fg}  contrast ${ratio.toFixed(2)}`);
  assert.ok(ratio >= AA, `Dark shade of ${base} contrast ${ratio.toFixed(2)} < ${AA}`);
  // light mode must be the unchanged base
  assert.equal(themedBackground(base, 'light'), base, `light mode must not alter ${base}`);
}
console.log(`✓ dark-theme shades of the palette >= AA (worst ${worstDark.toFixed(2)})`);

// Worst case for ANY base color in dark mode is the brightest possible dark
// output: lightness AND saturation pinned at their caps. If every hue there
// clears AA, every deeper/less-saturated dark shade does too.
let worstDarkHue = Infinity;
let worstDarkH = -1;
for (let h = 0; h < 360; h++) {
  const bg = hslToHex(h, DARK_SATURATION_CAP, DARK_LIGHTNESS_CAP);
  const ratio = bestPossible(bg);
  if (ratio < worstDarkHue) {
    worstDarkHue = ratio;
    worstDarkH = h;
  }
}
console.log(`  dark-mode hue sweep (cap L=${DARK_LIGHTNESS_CAP}, S=${DARK_SATURATION_CAP}) worst: hue ${worstDarkH} -> ${worstDarkHue.toFixed(2)}`);
assert.ok(worstDarkHue >= AA, `A dark-mode hue only reaches ${worstDarkHue.toFixed(2)} (< ${AA}); lower DARK_LIGHTNESS_CAP`);

// dark shades of the auto-generated colors
for (let h = 0; h < 360; h++) {
  const base = hslToHex(h, AUTO_SATURATION, AUTO_LIGHTNESS);
  const bg = themedBackground(base, 'dark');
  const ratio = bestPossible(bg);
  assert.ok(ratio >= AA, `Dark shade of auto hue ${h} contrast ${ratio.toFixed(2)} < ${AA}`);
}
console.log('✓ dark-theme shades of all 360 auto hues >= AA');

// ---- 5. HSL <-> hex round-trip is stable (guards the color-space math) -------
const roundTripSamples = [
  '#2e7d32', '#1565c0', '#ffffff', '#000000', '#808080',
  '#ff0000', '#00ff00', '#0000ff', '#123456', '#abcdef', '#15202b',
];
let worstDelta = 0;
for (const hex of roundTripSamples) {
  const hsl = hexToHsl(hex);
  const back = hslToHex(hsl.h, hsl.s, hsl.l);
  const a = hexToRgb(hex);
  const b = hexToRgb(back);
  const delta = Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
  worstDelta = Math.max(worstDelta, delta);
  assert.ok(delta <= 2, `round-trip ${hex} -> ${back} drifted by ${delta} (> 2)`);
}
console.log(`✓ hex -> HSL -> hex round-trip stable (worst channel drift ${worstDelta})`);

console.log('\nAll contrast checks passed ✅');
