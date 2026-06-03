# Changelog

All notable changes to the **Stamp** extension are documented here.

## [0.1.0] - 2026-06-03

### Added

- Set a per-project status bar color from a built-in palette, a custom hex
  value, or auto-generated from the project name.
- **Theme-adaptive shade.** The chosen color is stored as a base (`stamp.color`)
  and the painted shade is derived per theme: deepened/muted in dark themes so it
  doesn't glare, kept vivid in light themes. The bar repaints automatically when
  the active theme changes.
- Automatic, theme-aware foreground (text) color chosen by WCAG contrast, so the
  bar is readable in both light and dark themes.
- Full status-bar key coverage (`background`, `foreground`, `debugging*`,
  `noFolderBackground`, `remote*`) so the color stays consistent while debugging
  or working on a remote.
- Clickable 🪣 status bar item to open the color picker. Distinguishes a color
  set by Stamp for this workspace from one inherited from global settings.
- `stamp.autoColorOnOpen` to assign a name-derived color on first open. The
  "already colored?" check is scoped to the workspace, so a global status-bar
  color no longer suppresses it.
- A non-blocking warning when a custom color's text contrast falls below WCAG AA.
- Configurable light/dark foreground colors.
- Verification: `npm test` runs WCAG contrast checks across the palette and all
  360 auto-color hues, plus runtime smoke tests that drive every command against
  a mocked VSCode API.
