# Contributing to Stamp

Thanks for your interest in improving **Stamp** — the VS Code extension that
gives each project its own status-bar color.

## Getting started

```bash
npm install         # install dev dependencies
npm run compile     # tsc -p ./  → out/   (tests run against out/, so compile first)
npm run watch       # recompile on change
```

To run the extension from source, open the repo in VS Code and press **F5**
(the **Run Extension** launch config compiles first and opens an Extension
Development Host).

## Tests — the verification gate

```bash
npm test            # compile + WCAG contrast checks + runtime smoke tests
```

`npm test` must pass before a change is merged. It runs:

- `npm run check:contrast` — WCAG math, the palette, and a 360-hue sweep that
  fails if any hue drops below AA (4.5:1).
- `npm run smoke` — drives every command against a mocked VS Code API and
  enforces command-id parity between `package.json` and `extension.ts`.

The standalone `check:contrast` / `smoke` scripts import `out/*.js`, so always
`npm run compile` first.

## Project layout

- `src/color.ts` — pure color/WCAG math, **no `vscode` import** (so it stays
  unit-testable with plain Node). Don't import `vscode` here.
- `src/settings.ts` — all reads/writes of VS Code configuration.
- `src/extension.ts` — activation, the commands, the status-bar item.

`stamp.color` (a workspace setting) is the source of truth; the painted
`workbench.colorCustomizations` are derived from it and rewritten on every theme
change — treat them as a cache.

## License & REUSE compliance

This project is licensed under **AGPL-3.0-or-later** and is
[REUSE](https://reuse.software/)-compliant. By submitting a contribution you
agree that it is licensed under **AGPL-3.0-or-later**.

Every file must carry copyright and license information — either an inline
`SPDX-FileCopyrightText` / `SPDX-License-Identifier` header (source code, YAML)
or an entry in [`REUSE.toml`](./REUSE.toml) (JSON, binaries, docs). Before you
open a pull request, verify compliance:

```bash
reuse lint          # must report "compliant"; CI enforces this on every push
```

## Pull requests

1. Branch from `main`.
2. Keep changes focused; update `CHANGELOG.md` when behavior changes.
3. Make sure `npm test` and `reuse lint` both pass.
4. Open the PR with a clear description of what changed and why.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating you are expected to uphold it.

## Reporting bugs & vulnerabilities

- **Bugs / feature requests:** open a GitHub issue.
- **Security vulnerabilities:** follow [`SECURITY.md`](./SECURITY.md) — please do
  not open a public issue for security reports.
