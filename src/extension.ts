// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import * as vscode from 'vscode';
import { colorFromString, normalizeHex, WCAG_AA } from './color';
import { applyColor, clearColor, getCurrentColor, getWorkspaceColor, reapply } from './settings';

interface PaletteColor {
  label: string;
  hex: string;
}

const PALETTE: PaletteColor[] = [
  { label: 'Green', hex: '#2e7d32' },
  { label: 'Blue', hex: '#1565c0' },
  { label: 'Teal', hex: '#00838f' },
  { label: 'Indigo', hex: '#283593' },
  { label: 'Purple', hex: '#6a1b9a' },
  { label: 'Pink', hex: '#ad1457' },
  { label: 'Red', hex: '#c62828' },
  { label: 'Orange', hex: '#ef6c00' },
  { label: 'Brown', hex: '#4e342e' },
  { label: 'Slate', hex: '#37474f' },
];

interface ColorQuickPick extends vscode.QuickPickItem {
  hex?: string;
  action?: 'custom' | 'auto' | 'clear';
}

let statusItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusItem.command = 'stamp.setColor';
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('stamp.setColor', setColorCommand),
    vscode.commands.registerCommand('stamp.setCustomColor', setCustomColorCommand),
    vscode.commands.registerCommand('stamp.autoColor', autoColorCommand),
    vscode.commands.registerCommand('stamp.clearColor', clearColorCommand),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('workbench.colorCustomizations') ||
        event.affectsConfiguration('stamp.color') ||
        event.affectsConfiguration('stamp.showStatusBarItem')
      ) {
        updateStatusItem();
      }
    }),
    // When the user switches between a light and dark theme, repaint the stored
    // project color in the shade that suits the new theme.
    vscode.window.onDidChangeActiveColorTheme(() => {
      void onThemeChanged();
    }),
  );

  updateStatusItem();
  void runStartup();
}

export function deactivate(): void {
  // Nothing to clean up beyond context.subscriptions, disposed by VSCode.
}

async function onThemeChanged(): Promise<void> {
  await reapply();
  updateStatusItem();
}

async function runStartup(): Promise<void> {
  // Re-derive the shade for the current theme (the theme may have changed since
  // this project was last open), then optionally auto-color a fresh project.
  await reapply();
  await maybeAutoApplyOnStartup();
  updateStatusItem();
}

async function setColorCommand(): Promise<void> {
  const items: ColorQuickPick[] = PALETTE.map((color) => ({
    label: `$(circle-filled) ${color.label}`,
    description: color.hex,
    hex: color.hex,
  }));
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: '$(paintcan) Custom hex…', action: 'custom' });
  items.push({ label: '$(symbol-color) Auto from project name', action: 'auto' });
  items.push({ label: '$(clear-all) Clear color', action: 'clear' });

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Stamp — choose a status bar color',
    placeHolder: 'Pick a color for this project',
    matchOnDescription: true,
  });
  if (!pick) {
    return;
  }
  switch (pick.action) {
    case 'custom':
      await setCustomColorCommand();
      return;
    case 'auto':
      await autoColorCommand();
      return;
    case 'clear':
      await clearColorCommand();
      return;
  }
  if (pick.hex) {
    await safeApply(pick.hex);
  }
}

async function setCustomColorCommand(): Promise<void> {
  const input = await vscode.window.showInputBox({
    title: 'Stamp — custom color',
    prompt: 'Enter a hex color, e.g. #2e7d32 or 2e7d32',
    value: getWorkspaceColor() ?? '#2e7d32',
    validateInput: (value) =>
      value.trim() === '' || normalizeHex(value)
        ? undefined
        : 'Enter a valid 3- or 6-digit hex color.',
  });
  if (input === undefined) {
    return;
  }
  const hex = normalizeHex(input);
  if (!hex) {
    return;
  }
  await safeApply(hex);
}

async function autoColorCommand(): Promise<void> {
  const name =
    vscode.workspace.workspaceFolders?.[0]?.name ??
    vscode.workspace.name ??
    'workspace';
  await safeApply(colorFromString(name));
}

async function clearColorCommand(): Promise<void> {
  try {
    const cleared = await clearColor();
    updateStatusItem();
    vscode.window.setStatusBarMessage(
      cleared ? '$(check) Stamp: color cleared' : '$(info) Stamp: no project color to clear',
      2000,
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Stamp: ${(error as Error).message}`);
  }
}

async function safeApply(base: string): Promise<void> {
  try {
    const contrast = await applyColor(base);
    updateStatusItem();
    if (contrast > 0 && contrast < WCAG_AA) {
      // The bar still picks the most readable text, but warn so the user can
      // choose a deeper/lighter shade. In dark themes the color is deepened, so
      // this realistically only fires for mid-tone colors in a light theme.
      vscode.window.showWarningMessage(
        `Stamp: applied ${base}, but the text contrast is low (${contrast.toFixed(1)}:1, below ${WCAG_AA}:1). A darker or lighter color reads better.`,
      );
    }
    // No success toast — the recolored status bar is its own confirmation.
  } catch (error) {
    vscode.window.showErrorMessage(`Stamp: ${(error as Error).message}`);
  }
}

function updateStatusItem(): void {
  if (!statusItem) {
    return;
  }
  const show = vscode.workspace.getConfiguration('stamp').get<boolean>('showStatusBarItem', true);
  if (!show) {
    statusItem.hide();
    return;
  }
  const base = getWorkspaceColor(); // the project's base color (theme-independent)
  const effective = getCurrentColor(); // what is actually painted right now
  const shown = base ?? effective;
  statusItem.text = shown ? `$(paintcan) ${shown}` : '$(paintcan) Stamp';
  if (base) {
    statusItem.tooltip = `Stamp project color: ${base} (adapts to light/dark theme)\nClick to change`;
  } else if (effective) {
    statusItem.tooltip = `Inherited status bar color: ${effective}\nClick to set one for this project`;
  } else {
    statusItem.tooltip = 'Set a status bar color for this project';
  }
  statusItem.show();
}

async function maybeAutoApplyOnStartup(): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('stamp')
    .get<boolean>('autoColorOnOpen', false);
  if (!enabled) {
    return;
  }
  if ((vscode.workspace.workspaceFolders?.length ?? 0) === 0) {
    return;
  }
  if (getWorkspaceColor()) {
    return; // Respect a color THIS workspace already has (ignore inherited global colors).
  }
  await autoColorCommand();
}
