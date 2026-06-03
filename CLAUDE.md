# CLAUDE.md

Stamp is a VS Code extension that gives each project its own status-bar color,
with text color auto-chosen for WCAG-readable contrast in both light and dark
themes.

## Commands

```bash
npm install
npm run compile        # tsc -p ./  → out/   (tests run against out/, so compile first)
npm run watch          # recompile on change
npm test               # compile + contrast checks + runtime smoke tests (the verification gate)
npm run check:contrast # WCAG math + palette + 360-hue sweep (needs a prior compile)
npm run smoke          # drive every command against a mocked vscode API (needs a prior compile)
npm run make:icon      # regenerate icon.png (dependency-free PNG encoder)
```

Run from source: `npm run compile`, then press **F5** in VS Code to launch an
Extension Development Host (the `Run Extension` launch config compiles first).
Package: `npx @vscode/vsce package` → `stamp-*.vsix`.

## Architecture

Three source files in `src/` (compiled to `out/`):

- `color.ts` — **pure functions, no `vscode` import.** Hex/RGB/HSL math, WCAG
  contrast, theme shading, and the FNV-1a name→color hash. Kept vscode-free so
  it's testable with plain Node (`scripts/check-contrast.mjs`). Don't import
  `vscode` here.
- `settings.ts` — all reads/writes of VS Code configuration.
- `extension.ts` — activation, the four commands, the status-bar item.

**Source of truth:** `stamp.color` (a workspace setting) is the base color. The
painted `workbench.colorCustomizations` are **derived** from it for the active
theme and get **rewritten on every theme change** — treat them as a cache, not
canonical state. `stamp.color` is what you commit to share a project's color.

## Gotchas

- **Compile before testing.** The `.mjs` test scripts import `out/*.js`, not
  `src/`. `npm test` compiles first; the standalone `smoke`/`check:contrast`
  scripts do not.
- **All config writes use `ConfigurationTarget.Workspace`;** reads use
  `inspect().workspaceValue`, never the effective/merged value — otherwise a
  user's global color customizations leak into the workspace `settings.json`.
  The smoke test asserts the Workspace target.
- **Stamp writes the whole status-bar key family** (`debugging*`,
  `noFolderBackground`, `remote*`), not just `statusBar.background`, so the color
  stays put while debugging (VS Code would otherwise turn the bar orange). See
  `STAMP_KEYS` in `settings.ts`.
- **Contrast tuning is load-bearing.** `AUTO_LIGHTNESS`/`AUTO_SATURATION` (and
  the dark-theme `DARK_LIGHTNESS_CAP`/`DARK_SATURATION_CAP`) are chosen so every
  hue clears WCAG AA (4.5:1) and avoids the mid-tone "dead zone". If you change
  them, `check-contrast.mjs` sweeps all 360 hues and will fail if a hue drops
  below AA.
- **Dark themes deepen + desaturate the base; light themes paint it unchanged.**
  See `themedBackground()`.
- **Commands and settings are declared in `package.json` `contributes`** and
  registered in `extension.ts`; the smoke test enforces exact command-id parity
  between the two.

## Before publishing

`package.json` metadata (`publisher`, `repository`, `bugs`, `homepage`) is filled
in. To ship to the Marketplace you still need the `The-Fisher-Slopworks-Co` publisher
to exist with a Personal Access Token, then `npx @vscode/vsce publish`. Build a
local `.vsix` first with `npx @vscode/vsce package`.
