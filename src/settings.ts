// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import * as vscode from 'vscode';
import { normalizeHex, readability, themedBackground, ThemeMode } from './color';

/**
 * The `workbench.colorCustomizations` keys that Stamp owns. Setting the whole
 * family (not just `statusBar.background`) keeps the project color stable while
 * debugging — VSCode would otherwise paint the bar orange — and when no folder
 * or a remote is involved.
 */
const STAMP_KEYS = [
  'statusBar.background',
  'statusBar.foreground',
  'statusBar.debuggingBackground',
  'statusBar.debuggingForeground',
  'statusBar.noFolderBackground',
  'statusBarItem.remoteBackground',
  'statusBarItem.remoteForeground',
] as const;

const BACKGROUND_KEY = 'statusBar.background';
const FOREGROUND_KEY = 'statusBar.foreground';

/** The workspace setting holding the project's BASE color (the source of truth). */
const COLOR_SETTING = 'color';

type Customizations = Record<string, unknown>;

function workbenchConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('workbench');
}

function stampConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('stamp');
}

function hasWorkspace(): boolean {
  return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}

/** Whether the active editor theme is dark (incl. high-contrast dark) or light. */
function currentMode(): ThemeMode {
  const kind = vscode.window.activeColorTheme?.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
    ? 'light'
    : 'dark';
}

/**
 * The currently active status-bar background, reading the *effective* merged
 * value (so the status bar item reflects whatever color is actually painted).
 */
export function getCurrentColor(): string | undefined {
  const customizations = workbenchConfig().get<Customizations>('colorCustomizations');
  const value = customizations?.[BACKGROUND_KEY];
  return typeof value === 'string' ? value : undefined;
}

/**
 * The BASE project color stored in *this workspace* (`stamp.color`). This is the
 * source of truth the theme-specific shade is derived from, and it answers
 * "has Stamp colored this project?" — scoped to the workspace, so an inherited
 * global color does not count.
 */
export function getWorkspaceColor(): string | undefined {
  const value = stampConfig().inspect<string>(COLOR_SETTING)?.workspaceValue;
  return typeof value === 'string' ? normalizeHex(value) : undefined;
}

/**
 * Read only the *workspace-scoped* customizations. Merging must start from this,
 * not the effective value, otherwise the user's global color customizations
 * would be copied into the workspace settings file. Guards against a malformed
 * on-disk value (the setting is user-editable): a non-object yields `{}` rather
 * than a spread of a string/array into numeric-index keys.
 */
function readWorkspaceCustomizations(): Customizations {
  const workspaceValue = workbenchConfig().inspect<Customizations>('colorCustomizations')?.workspaceValue;
  return workspaceValue && typeof workspaceValue === 'object' && !Array.isArray(workspaceValue)
    ? { ...workspaceValue }
    : {};
}

/**
 * Write the theme-appropriate shade of `base` into this workspace's color
 * customizations. Skips the write when the result already matches (so toggling
 * the theme or re-activating does not needlessly churn settings.json). Returns
 * the foreground contrast ratio of the shade that is (or already was) applied.
 */
async function writeThemedColor(base: string): Promise<number> {
  const background = themedBackground(base, currentMode());
  const stamp = stampConfig();
  const { foreground, contrast } = readability(
    background,
    stamp.get<string>('lightForeground'),
    stamp.get<string>('darkForeground'),
  );

  const next = readWorkspaceCustomizations();
  if (next[BACKGROUND_KEY] === background && next[FOREGROUND_KEY] === foreground) {
    return contrast; // already up to date for this theme
  }

  next['statusBar.background'] = background;
  next['statusBar.foreground'] = foreground;
  next['statusBar.debuggingBackground'] = background;
  next['statusBar.debuggingForeground'] = foreground;
  next['statusBar.noFolderBackground'] = background;
  next['statusBarItem.remoteBackground'] = background;
  next['statusBarItem.remoteForeground'] = foreground;

  await workbenchConfig().update('colorCustomizations', next, vscode.ConfigurationTarget.Workspace);
  return contrast;
}

/**
 * Set this project's base color and paint the theme-appropriate shade.
 * Returns the foreground contrast ratio of the painted shade (so the caller can
 * warn about a low-contrast choice).
 */
export async function applyColor(base: string): Promise<number> {
  if (!hasWorkspace()) {
    throw new Error('Open a folder or workspace first — Stamp stores the color in workspace settings.');
  }
  await stampConfig().update(COLOR_SETTING, base, vscode.ConfigurationTarget.Workspace);
  return writeThemedColor(base);
}

/**
 * Re-derive and repaint the shade for the current theme from the stored base
 * color. No-op when this workspace has no Stamp color. Call on theme change and
 * on activation.
 */
export async function reapply(): Promise<void> {
  if (!hasWorkspace()) {
    return;
  }
  const base = getWorkspaceColor();
  if (base) {
    await writeThemedColor(base);
  }
}

/**
 * Remove Stamp's keys (and the stored base color) from this workspace.
 * Returns `true` if something was actually removed, `false` if this workspace
 * had no Stamp color to clear.
 */
export async function clearColor(): Promise<boolean> {
  if (!hasWorkspace()) {
    throw new Error('No workspace folder is open.');
  }

  const hadBase = getWorkspaceColor() !== undefined;
  if (hadBase) {
    await stampConfig().update(COLOR_SETTING, undefined, vscode.ConfigurationTarget.Workspace);
  }

  const next = readWorkspaceCustomizations();
  let changedCustomizations = false;
  for (const key of STAMP_KEYS) {
    if (key in next) {
      delete next[key];
      changedCustomizations = true;
    }
  }
  if (changedCustomizations) {
    const isEmpty = Object.keys(next).length === 0;
    await workbenchConfig().update(
      'colorCustomizations',
      // Writing `undefined` removes the key entirely instead of leaving `{}`.
      isEmpty ? undefined : next,
      vscode.ConfigurationTarget.Workspace,
    );
  }

  return hadBase || changedCustomizations;
}
