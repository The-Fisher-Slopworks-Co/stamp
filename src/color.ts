// SPDX-FileCopyrightText: 2026 Stamp contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Color utilities for Stamp.
 *
 * Pure functions only — no `vscode` dependency — so they can be unit-checked
 * with plain Node (see scripts/check-contrast.mjs).
 */

export interface RGB {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
}

export const DEFAULT_LIGHT_FOREGROUND = '#ffffff';
export const DEFAULT_DARK_FOREGROUND = '#15202b';

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalize a user-supplied hex string to the canonical `#rrggbb` lowercase
 * form. Accepts `#rgb`, `rgb`, `#rrggbb`, `rrggbb`. Returns `undefined` when the
 * input is not a valid hex color.
 */
export function normalizeHex(input: string): string | undefined {
  const match = input.trim().match(HEX_RE);
  if (!match) {
    return undefined;
  }
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return '#' + hex.toLowerCase();
}

export function hexToRgb(hex: string): RGB | undefined {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return undefined;
  }
  const value = parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/** sRGB channel (0–255) → linear-light value, per WCAG 2.x. */
function channelToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a color, in [0, 1]. */
export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

/** WCAG contrast ratio between two relative luminances, in [1, 21]. */
export function contrastRatio(lumA: number, lumB: number): number {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.x AA contrast threshold for normal-size text. */
export const WCAG_AA = 4.5;

/**
 * Pick whichever foreground (the configured light or dark text color) has the
 * higher contrast ratio against `background`, and report the ratio achieved.
 * This is what makes the result readable in both light and dark editor themes:
 * a light/pale project color gets dark text, a deep project color gets light
 * text.
 *
 * Falls back to the light foreground (with contrast 0) if the background cannot
 * be parsed.
 */
export function readability(
  background: string,
  light: string = DEFAULT_LIGHT_FOREGROUND,
  dark: string = DEFAULT_DARK_FOREGROUND,
): { foreground: string; contrast: number } {
  const safeLight = normalizeHex(light) ?? DEFAULT_LIGHT_FOREGROUND;
  const safeDark = normalizeHex(dark) ?? DEFAULT_DARK_FOREGROUND;
  const bg = hexToRgb(background);
  if (!bg) {
    return { foreground: safeLight, contrast: 0 };
  }
  const bgLum = relativeLuminance(bg);
  const lightContrast = contrastRatio(bgLum, relativeLuminance(hexToRgb(safeLight)!));
  const darkContrast = contrastRatio(bgLum, relativeLuminance(hexToRgb(safeDark)!));
  return lightContrast >= darkContrast
    ? { foreground: safeLight, contrast: lightContrast }
    : { foreground: safeDark, contrast: darkContrast };
}

/** Convenience wrapper returning only the chosen foreground color. */
export function readableForeground(
  background: string,
  light: string = DEFAULT_LIGHT_FOREGROUND,
  dark: string = DEFAULT_DARK_FOREGROUND,
): string {
  return readability(background, light, dark).foreground;
}

/** Convert HSL (h in [0,360), s & l in [0,1]) to a `#rrggbb` hex string. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const lum = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    [r, g, b] = [c, x, 0];
  } else if (hp < 2) {
    [r, g, b] = [x, c, 0];
  } else if (hp < 3) {
    [r, g, b] = [0, c, x];
  } else if (hp < 4) {
    [r, g, b] = [0, x, c];
  } else if (hp < 5) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }
  const m = lum - c / 2;
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

export interface HSL {
  h: number; // 0–360
  s: number; // 0–1
  l: number; // 0–1
}

/** Convert RGB (0–255) to HSL (h in [0,360), s & l in [0,1]). */
export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return { h: 0, s: 0, l };
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) {
    h = (((gn - bn) / d) % 6 + 6) % 6;
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s, l };
}

export function hexToHsl(hex: string): HSL | undefined {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsl(rgb) : undefined;
}

export type ThemeMode = 'dark' | 'light';

/**
 * In dark themes a vivid status bar glares against the dim editor UI, so the
 * project color is deepened (lightness capped low) and slightly desaturated
 * until it reads as a calm accent rather than a glowing block. White text then
 * clears WCAG AA against it for every hue with comfortable margin.
 */
export const DARK_LIGHTNESS_CAP = 0.2;
export const DARK_SATURATION_CAP = 0.5;

/**
 * Adapt a base project color to the active theme.
 *  - dark themes:  deepened/muted shade (so it does not burn the eyes)
 *  - light themes: the chosen color unchanged (a solid accent on a light UI)
 * `min(...)` only ever darkens/desaturates, so a base already deeper than the
 * cap is left alone rather than brightened.
 */
export function themedBackground(base: string, mode: ThemeMode): string {
  const normalized = normalizeHex(base);
  if (!normalized) {
    return base;
  }
  if (mode === 'light') {
    return normalized;
  }
  const hsl = hexToHsl(normalized)!;
  return hslToHex(hsl.h, Math.min(hsl.s, DARK_SATURATION_CAP), Math.min(hsl.l, DARK_LIGHTNESS_CAP));
}

/**
 * Saturation/lightness used for auto-generated project colors. Deliberately on
 * the deep side: at this lightness *every* hue on the wheel is dark enough that
 * the light foreground clears WCAG AA (>= 4.5), so auto colors are always
 * readable. A brighter lightness would leave some hues (amber ~30–40°) stranded
 * in the "dead zone" where neither white nor dark text reaches 4.5. See
 * scripts/check-contrast.mjs, which sweeps all 360 hues against these values.
 */
export const AUTO_SATURATION = 0.6;
export const AUTO_LIGHTNESS = 0.28;

/**
 * Deterministically derive a deep, saturated color from an arbitrary string
 * (e.g. a project name) using an FNV-1a hash mapped onto the hue circle. The
 * same name always yields the same color, so distinct projects get distinct,
 * stable colors automatically.
 */
export function colorFromString(input: string): string {
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  const hue = (hash >>> 0) % 360;
  return hslToHex(hue, AUTO_SATURATION, AUTO_LIGHTNESS);
}
