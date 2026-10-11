// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // `src/extension.ts` is found through package.json `main` (out/ → src/).
  entry: [
    // The test scripts are roots of their own.
    "scripts/*.mjs",
    // The scripts load the compiled `out/color.js`, a path knip does not map
    // back to src/, so the exports they test would all read as unused. Naming
    // the module as an entry keeps its export list as the scripts' API.
    "src/color.ts",
  ],
  project: ["src/**/*.ts", "scripts/**/*.mjs"],
  // `uv` is a machine prerequisite, not an npm package.
  ignoreBinaries: ["uvx"],
};

export default config;
