// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Runtime smoke test: loads the COMPILED extension (out/extension.js) against a
 * mocked `vscode` API, activates it, and drives each command end-to-end. This
 * catches things tsc cannot: command-id mismatches, API misuse at activation,
 * the workspace-scoped settings writes/clears, the global-color startup gate,
 * and the theme-adaptive shading (dark vs light, and re-shading on theme change).
 *
 * Run after compiling:  node scripts/smoke-test.mjs
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);

// Pure color helpers, used to compute the EXPECTED painted shade per theme.
const colorMod = req('../out/color.js');
const { themedBackground, readableForeground } = colorMod;

// ---- intercept `require('vscode')` -----------------------------------------
let currentMock = null;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return currentMock.vscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const KIND = { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 };

const STAMP_KEYS = [
  'statusBar.background',
  'statusBar.foreground',
  'statusBar.debuggingBackground',
  'statusBar.debuggingForeground',
  'statusBar.noFolderBackground',
  'statusBarItem.remoteBackground',
  'statusBarItem.remoteForeground',
];

function buildMock(state) {
  const calls = {
    commands: new Map(),
    errors: [],
    warnings: [],
    status: [],
    configListener: null,
    themeListener: null,
  };

  const makeConfig = (section) => {
    if (section === 'workbench') {
      return {
        get(key) {
          if (key !== 'colorCustomizations') return undefined;
          return { ...state.global, ...state.workspace };
        },
        inspect(key) {
          if (key !== 'colorCustomizations') return undefined;
          const hasWs = Object.keys(state.workspace).length > 0;
          return {
            key,
            globalValue: Object.keys(state.global).length ? { ...state.global } : undefined,
            workspaceValue: hasWs ? { ...state.workspace } : undefined,
            workspaceFolderValue: undefined,
          };
        },
        async update(key, value, target) {
          assert.equal(key, 'colorCustomizations');
          assert.equal(target, mock.vscode.ConfigurationTarget.Workspace, 'must write to Workspace scope');
          state.workspace = value === undefined ? {} : { ...value };
        },
      };
    }
    // 'stamp'
    return {
      get(key, def) {
        return key in state.stamp ? state.stamp[key] : def;
      },
      inspect(key) {
        return {
          key: `stamp.${key}`,
          globalValue: undefined,
          workspaceValue: key in state.stamp ? state.stamp[key] : undefined,
          workspaceFolderValue: undefined,
        };
      },
      async update(key, value, target) {
        assert.equal(target, mock.vscode.ConfigurationTarget.Workspace, 'must write to Workspace scope');
        if (value === undefined) delete state.stamp[key];
        else state.stamp[key] = value;
      },
    };
  };

  const mock = {
    vscode: {
      StatusBarAlignment: { Left: 1, Right: 2 },
      QuickPickItemKind: { Separator: -1, Default: 0 },
      ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
      ColorThemeKind: { ...KIND },
      window: {
        get activeColorTheme() { return { kind: state.themeKind ?? KIND.Dark }; },
        createStatusBarItem: () => ({
          text: '', tooltip: '', command: '',
          show() {}, hide() {}, dispose() {},
        }),
        showQuickPick: async (items) => (state.pickQuickPick ? state.pickQuickPick(items) : undefined),
        showInputBox: async (opts) => (state.pickInputBox ? state.pickInputBox(opts) : undefined),
        showErrorMessage: async (m) => { calls.errors.push(m); },
        showWarningMessage: async (m) => { calls.warnings.push(m); },
        setStatusBarMessage: (m) => { calls.status.push(m); },
        onDidChangeActiveColorTheme: (cb) => { calls.themeListener = cb; return { dispose() {} }; },
      },
      commands: {
        registerCommand: (id, handler) => { calls.commands.set(id, handler); return { dispose() {} }; },
        executeCommand: async () => {},
      },
      workspace: {
        get workspaceFolders() {
          return state.workspaceFolders ? [{ name: state.folderName ?? 'proj', uri: {} }] : undefined;
        },
        get name() { return state.workspaceName; },
        getConfiguration: (section) => makeConfig(section),
        onDidChangeConfiguration: (cb) => { calls.configListener = cb; return { dispose() {} }; },
      },
    },
    calls,
  };
  return mock;
}

function freshState(overrides = {}) {
  return {
    workspaceFolders: true,
    folderName: 'proj',
    workspaceName: undefined,
    themeKind: KIND.Dark,
    global: {},
    workspace: {},
    stamp: {},
    pickQuickPick: undefined,
    pickInputBox: undefined,
    ...overrides,
  };
}

function loadExtension(mock) {
  currentMock = mock;
  for (const name of ['extension', 'settings', 'color']) {
    delete req.cache[req.resolve(`../out/${name}.js`)];
  }
  const ext = req('../out/extension.js');
  const context = { subscriptions: [] };
  ext.activate(context);
  return { ext, context };
}

// Let activate()'s `void runStartup()` (and any awaited theme handler) settle.
const settle = async () => {
  await Promise.resolve();
  await new Promise((r) => setImmediate(r));
};

function stampKeysIn(obj) {
  return STAMP_KEYS.filter((k) => k in obj);
}

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
};

// ---- command-id parity with package.json ------------------------------------
await test('all package.json commands are registered (and vice versa)', async () => {
  const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  const declared = pkg.contributes.commands.map((c) => c.command).sort();
  const mock = buildMock(freshState());
  loadExtension(mock);
  const registered = [...mock.calls.commands.keys()].sort();
  assert.deepEqual(registered, declared, 'registered commands must match declared commands exactly');
});

// ---- dark theme: a palette pick is deepened, base stored, full key set written
await test('setColor in a DARK theme stores the base and paints a deepened shade', async () => {
  const base = '#1565c0';
  const state = freshState({ themeKind: KIND.Dark, pickQuickPick: (items) => items.find((i) => i.hex === base) });
  const mock = buildMock(state);
  loadExtension(mock);
  await mock.calls.commands.get('stamp.setColor')();

  const bg = themedBackground(base, 'dark');
  const fg = readableForeground(bg);
  assert.equal(state.stamp.color, base, 'base color stored in stamp.color');
  assert.notEqual(bg, base, 'dark theme must deepen the base');
  assert.equal(state.workspace['statusBar.background'], bg);
  assert.equal(state.workspace['statusBar.foreground'], fg);
  assert.equal(state.workspace['statusBar.debuggingBackground'], bg);
  assert.equal(state.workspace['statusBar.noFolderBackground'], bg);
  assert.deepEqual(stampKeysIn(state.workspace).sort(), [...STAMP_KEYS].sort());
  assert.equal(mock.calls.errors.length, 0);
  assert.equal(mock.calls.warnings.length, 0);
});

// ---- light theme: the chosen color is painted unchanged, with dark text ------
await test('setCustomColor in a LIGHT theme paints the base unchanged with dark text', async () => {
  const base = '#ffd54f'; // light amber
  const state = freshState({ themeKind: KIND.Light, pickInputBox: () => base });
  const mock = buildMock(state);
  loadExtension(mock);
  await mock.calls.commands.get('stamp.setCustomColor')();
  assert.equal(state.stamp.color, base);
  assert.equal(state.workspace['statusBar.background'], base, 'light theme keeps the base color');
  assert.equal(state.workspace['statusBar.foreground'], '#15202b', 'light bg -> dark text');
  assert.equal(mock.calls.warnings.length, 0);
});

// ---- the feature: switching theme repaints the SAME base in a new shade ------
await test('switching dark -> light re-derives the shade from the stored base', async () => {
  const base = '#2e7d32';
  const state = freshState({ themeKind: KIND.Dark, pickInputBox: () => base });
  const mock = buildMock(state);
  loadExtension(mock);
  await mock.calls.commands.get('stamp.setCustomColor')();
  const darkBg = state.workspace['statusBar.background'];
  assert.equal(darkBg, themedBackground(base, 'dark'));

  // user switches to a light theme
  state.themeKind = KIND.Light;
  await mock.calls.themeListener({ kind: KIND.Light });
  await settle();

  assert.equal(state.stamp.color, base, 'base is unchanged by re-shading');
  assert.equal(state.workspace['statusBar.background'], base, 'light shade == base');
  assert.notEqual(state.workspace['statusBar.background'], darkBg, 'shade actually changed with the theme');
});

// ---- mid-gray in a light theme stays low-contrast and warns ------------------
await test('mid-gray custom color in a LIGHT theme warns about low contrast', async () => {
  const state = freshState({ themeKind: KIND.Light, pickInputBox: () => '808080' });
  const mock = buildMock(state);
  loadExtension(mock);
  await mock.calls.commands.get('stamp.setCustomColor')();
  assert.equal(state.workspace['statusBar.background'], '#808080');
  assert.equal(state.workspace['statusBar.foreground'], '#15202b');
  assert.equal(mock.calls.warnings.length, 1, 'should warn on sub-AA contrast');
  assert.match(mock.calls.warnings[0], /low/i);
});

// ---- clear removes Stamp keys + the base, preserves unrelated keys -----------
await test('clearColor removes Stamp keys and stamp.color, preserves other keys', async () => {
  const state = freshState({ stamp: { color: '#2e7d32' } });
  state.workspace = {
    'statusBar.background': '#1b4b1e',
    'statusBar.foreground': '#ffffff',
    'statusBar.debuggingBackground': '#1b4b1e',
    'editor.background': '#101010', // unrelated — must survive
  };
  const mock = buildMock(state);
  loadExtension(mock);
  await settle();
  await mock.calls.commands.get('stamp.clearColor')();
  assert.equal(stampKeysIn(state.workspace).length, 0, 'all Stamp keys removed');
  assert.equal(state.stamp.color, undefined, 'base color removed');
  assert.equal(state.workspace['editor.background'], '#101010', 'unrelated key preserved');
  assert.ok(mock.calls.status.some((m) => /cleared/i.test(m)));
});

// ---- clearing when nothing else remains drops the key entirely ---------------
await test('clearColor drops colorCustomizations entirely when only Stamp keys remained', async () => {
  const state = freshState({ stamp: { color: '#2e7d32' } });
  state.workspace = { 'statusBar.background': '#1b4b1e', 'statusBar.foreground': '#ffffff' };
  const mock = buildMock(state);
  loadExtension(mock);
  await settle();
  await mock.calls.commands.get('stamp.clearColor')();
  assert.deepEqual(state.workspace, {}, 'object becomes empty (key removed)');
  assert.equal(state.stamp.color, undefined);
});

// ---- clearing a project with no Stamp color reports a neutral message --------
await test('clearColor on a project with no Stamp color reports "nothing to clear"', async () => {
  const state = freshState();
  const mock = buildMock(state);
  loadExtension(mock);
  await mock.calls.commands.get('stamp.clearColor')();
  assert.ok(mock.calls.status.some((m) => /no project color/i.test(m)));
});

// ---- the fixed bug: a GLOBAL color must NOT suppress auto-apply --------------
await test('autoColorOnOpen fires even when a GLOBAL statusBar color exists', async () => {
  const state = freshState({
    global: { 'statusBar.background': '#123456' },
    stamp: { autoColorOnOpen: true },
    folderName: 'project-1',
  });
  const mock = buildMock(state);
  loadExtension(mock);
  await settle();
  assert.ok(state.stamp.color, 'a base color should have been auto-assigned');
  assert.notEqual(state.stamp.color, '#123456', 'auto color must derive from the project name, not the global color');
  assert.ok(state.workspace['statusBar.background'], 'a painted shade should exist');
});

// ---- auto-apply respects an existing WORKSPACE base color -------------------
await test('autoColorOnOpen does NOT overwrite an existing base color', async () => {
  const state = freshState({ stamp: { color: '#2e7d32', autoColorOnOpen: true } });
  const mock = buildMock(state);
  loadExtension(mock);
  await settle();
  assert.equal(state.stamp.color, '#2e7d32', 'existing base color preserved');
  // startup still re-shades it for the current (dark) theme
  assert.equal(state.workspace['statusBar.background'], themedBackground('#2e7d32', 'dark'));
});

// ---- applying with no open folder errors cleanly, writes nothing ------------
await test('applying with no workspace folder shows an error, writes nothing', async () => {
  const state = freshState({ workspaceFolders: false, pickInputBox: () => '#2e7d32' });
  const mock = buildMock(state);
  loadExtension(mock);
  await mock.calls.commands.get('stamp.setCustomColor')();
  assert.equal(mock.calls.errors.length, 1, 'should surface an error');
  assert.deepEqual(state.workspace, {}, 'nothing written without a folder');
  assert.equal(state.stamp.color, undefined, 'no base stored without a folder');
});

Module._load = originalLoad;
console.log(`\nAll ${passed} runtime smoke tests passed ✅`);
