# Stamp — Per-Project Status Bar Color

Give every project its own status bar color, so you can tell at a glance which
window is which. The text color is chosen automatically for readability, so it
looks right in **both light and dark themes**.

> Project 1 → green · Project 2 → blue · and so on.

---

## How it works

You pick **one base color** per project. Stamp stores it in `stamp.color` and
**derives** the actually-painted shade for your active theme, writing it into the
workspace `workbench.colorCustomizations`:

```jsonc
// .vscode/settings.json  — e.g. base #2e7d32 in a DARK theme
{
  "stamp.color": "#2e7d32",               // the base — the source of truth
  "workbench.colorCustomizations": {       // derived; recomputed per theme
    "statusBar.background": "#1b4b1e",      // deepened so it doesn't glare
    "statusBar.foreground": "#ffffff",
    "statusBar.debuggingBackground": "#1b4b1e",
    "statusBar.debuggingForeground": "#ffffff",
    "statusBar.noFolderBackground": "#1b4b1e",
    "statusBarItem.remoteBackground": "#1b4b1e",
    "statusBarItem.remoteForeground": "#ffffff"
  }
}
```

- **Theme-adaptive shade.** In a **dark** theme the base is deepened and slightly
  desaturated so the bar reads as a calm accent, not a glowing block. In a
  **light** theme the base is used as-is. Stamp listens for theme changes and
  repaints, so switching light ⇄ dark updates the bar automatically.
- **Readable text everywhere.** The foreground is chosen by WCAG contrast against
  the painted shade — white on dark, dark on light.
- **`stamp.color` is the source of truth**; `workbench.colorCustomizations` is
  derived and may be rewritten whenever the theme changes. Commit `stamp.color`
  to share the project color with your team — each machine re-derives the shade
  for its own theme.
- The `debugging*` and `noFolder*` keys are set too, so the project color stays
  put even while debugging (VSCode would otherwise turn the bar orange).

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `stamp.color` | — | This project's base color (hex). Set via the commands; the painted shade is derived from it per theme. |
| `stamp.showStatusBarItem` | `true` | Show the 🪣 Stamp item in the status bar. |
| `stamp.autoColorOnOpen` | `false` | Auto-assign a name-derived color when a project opens with no color set. |
| `stamp.lightForeground` | `#ffffff` | Text color used on dark backgrounds. |
| `stamp.darkForeground` | `#15202b` | Text color used on light backgrounds. |

## Develop / run from source

```bash
npm install
npm run compile
# then press F5 in VSCode to launch an Extension Development Host
```

Other scripts:

```bash
npm test               # compile + contrast checks + runtime smoke tests
npm run watch          # recompile on change
npm run check:contrast # verify the contrast logic (after compile)
npm run smoke          # drive every command against a mocked VSCode API
npm run make:icon      # regenerate icon.png
```

You can also install the packaged build directly:

```bash
npx @vscode/vsce package        # produces stamp-0.1.0.vsix
code --install-extension stamp-0.1.0.vsix
```

## License

GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later) — see
[`LICENSES/AGPL-3.0-or-later.txt`](./LICENSES/AGPL-3.0-or-later.txt). This
project is [REUSE](https://reuse.software/)-compliant.
