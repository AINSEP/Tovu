import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AgentPluginRow } from '../AgentPluginRow';
import type { AdminAgentPlugin } from '@/lib/api';
import { t } from '../plugins-i18n';

it.each([
  ['connected', 'Signed in'], ['disconnected', 'Not signed in'], ['pending', 'Waiting for sign-in'], ['needs_reauth', 'Sign in again'],
] as const)('Agent Plugins displays %s separately from Enabled', (connectionStatus, label) => {
  const plugin: AdminAgentPlugin = { pluginId: 'example-media', enabled: true, version: null, description: null,
    keywords: [], skills: [], mcpServerIds: ['example'], connectionStatus };
  render(<ul><AgentPluginRow plugin={plugin} t={key => key} locale="en" expanded={false} busy={false}
    onToggleExpanded={vi.fn()} stateControl={{ kind: 'toggle', onToggleEnabled: vi.fn() }}
    onInspect={vi.fn()} uninstallNoteId="note" agentHandleBase="example-media" /></ul>);
  const row = screen.getByRole('listitem', { name: 'Example Media' });
  expect(within(row).getByText('Enabled')).toBeVisible();
  expect(within(row).getByText(label)).toBeVisible();
  expect(within(row).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});

it('a plugin with no account connection does not claim it needs a sign-in', () => {
  render(<ul><AgentPluginRow plugin={{ pluginId: 'local-tools', enabled: false, version: null, description: null,
    keywords: [], skills: [], mcpServerIds: [] }} t={key => key} locale="en" expanded={false} busy={false}
    onToggleExpanded={vi.fn()} stateControl={{ kind: 'toggle', onToggleEnabled: vi.fn() }}
    onInspect={vi.fn()} uninstallNoteId="note" agentHandleBase="local-tools" /></ul>);
  expect(screen.queryByText('Not signed in')).toBeNull();
});

it('sign-in status labels are translated for every shipped plugin locale', () => {
  for (const locale of ['es', 'id', 'de', 'zh-CN', 'zh-TW', 'pt-BR', 'ru', 'fa', 'ar', 'ja', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'it', 'hi', 'ur', 'bn']) {
    for (const key of ['Signed in', 'Not signed in', 'Waiting for sign-in', 'Sign in again']) {
      expect(t({ locale, key }), `${locale}: ${key}`).not.toBe(key);
    }
  }
});
