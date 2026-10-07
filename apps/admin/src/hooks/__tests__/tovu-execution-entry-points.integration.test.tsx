import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ExecutionConfig, ExecutionPort } from '@jini-ai/ui';
import { SettingsUi } from '@/features/settings/SettingsUi';
import type { SettingsUiController } from '@/features/settings/hooks/use-settings-ui.hooks';
import { AdminExecutionMode } from '@/features/ai-assistant/AiAssistant';
import type { AdminExecutionCredentialController } from '../use-admin-execution-credential.hooks';
import { AssistantDock } from '@/components/AssistantDock/AssistantDock';
import { DEFAULT_EXECUTION_CONFIG } from '@/lib/execution-settings';
import { DEFAULT_APPEARANCE, DEFAULT_INSTRUCTIONS, DEFAULT_INTERFACE, DEFAULT_NOTIFICATIONS, DEFAULT_PRIVACY, ADMIN_LOCALES } from '@/lib/settings-tabs';
import type { SettingsSlice } from '../use-settings-slice.hooks';
import { emptyComposerCapabilityProjection } from '@/features/plugins/composer-capabilities';
import { useTovuExecutionPolicy } from '../use-tovu-execution-policy.hooks';
import { DEPLOYED_LOCAL_CLI_NOTE } from '@/lib/tovu-execution-policy';
import { t } from '@/features/settings/settings-execution-i18n';

let style: HTMLStyleElement;
beforeEach(() => {
  // Vitest disables imported CSS. Apply the actual host sheet so visibility assertions include
  // the portaled picker rather than asserting data attributes in a look-alike component.
  style = document.createElement('style');
  style.textContent = readFileSync('src/styles/local-cli-policy.css', 'utf8');
  document.head.append(style);
});
afterEach(() => { style.remove(); localStorage.clear(); });

const saved = { ...DEFAULT_EXECUTION_CONFIG, localCli: { agentId: 'codex' } };
const useDeployed: typeof useTovuExecutionPolicy = (input) => useTovuExecutionPolicy(input, { desktop: false, loadRuntime: async () => ({ mode: 'production' }) });
const useLocal: typeof useTovuExecutionPolicy = (input) => useTovuExecutionPolicy(input, { desktop: false, loadRuntime: async () => ({ mode: 'local' }) });
function slice<T>(value: T): SettingsSlice<T> {
  return { value, onChange: vi.fn(), loadError: null, saveState: { status: 'idle' }, refresh: vi.fn() };
}
function executionPort(): ExecutionPort {
  return { detectLocalAgents: vi.fn(async () => [{ id: 'codex', label: 'Codex', installed: true }]), testConnection: async () => ({ ok: true }) };
}
function credential(): AdminExecutionCredentialController {
  return {
    stored: null, apiKeyStoredExternally: false, apiKeyPlaceholder: undefined,
    storedKeyIsForOtherEndpoint: false, canDiscoverModels: false,
    saveState: { status: 'idle' }, settingsSaveState: { status: 'idle' },
    canSaveKey: false, saveKey: vi.fn(async () => {}), saveSettings: vi.fn(async () => {}),
    legacyKey: null, migrateLegacyKey: vi.fn(async () => {}), dismissLegacyPrompt: vi.fn(),
  };
}

it('Settings AI agent hides CLI, renders BYOK and preserves saved mode on provider edits', async () => {
  const execution = slice<ExecutionConfig>(saved);
  const port = executionPort();
  const controller = {
    memoryTopTab: 'memories', setMemoryTopTab: vi.fn(), port, execution,
    instructions: slice(DEFAULT_INSTRUCTIONS), notifications: slice(DEFAULT_NOTIFICATIONS),
    privacy: slice(DEFAULT_PRIVACY), appearance: slice(DEFAULT_APPEARANCE),
    language: slice('en'), interface: slice(DEFAULT_INTERFACE),
    loading: false, loadError: null, save: { status: 'idle' },
  } as SettingsUiController;
  render(<SettingsUi useSettingsUiHook={() => controller} useAdminExecutionCredentialHook={credential} useExecutionPolicy={useDeployed} />);
  await screen.findByText(DEPLOYED_LOCAL_CLI_NOTE);
  expect(screen.queryByRole('tab', { name: /^Local CLI/ })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^BYOK/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByText('Choose Local CLI or BYOK.')).not.toBeInTheDocument();
  expect(port.detectLocalAgents).not.toHaveBeenCalled();
  expect(execution.onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
  expect(execution.onChange).toHaveBeenCalledOnce();
  expect(vi.mocked(execution.onChange).mock.calls[0][0].mode).toBe('local-cli');
  expect(vi.mocked(execution.onChange).mock.calls[0][0].byok.providerId).toBe('openai');
});

it('AI Assistant execution panel applies the same gate and note without detection or writes', async () => {
  const execution = slice<ExecutionConfig>(saved), port = executionPort();
  render(<AdminExecutionMode useAdminExecutionModeHook={() => ({ port: { current: port }, execution })} useAdminExecutionCredentialHook={credential} useExecutionPolicy={useDeployed} />);
  await screen.findByText(DEPLOYED_LOCAL_CLI_NOTE);
  expect(screen.queryByRole('tab', { name: /^Local CLI/ })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^BYOK/ })).toHaveAttribute('aria-selected', 'true');
  expect(port.detectLocalAgents).not.toHaveBeenCalled();
  expect(execution.onChange).not.toHaveBeenCalled();
});

it('local dev retains the CLI tab, selected agent list and discovery', async () => {
  const port = executionPort();
  render(<AdminExecutionMode useAdminExecutionModeHook={() => ({ port: { current: port }, execution: slice<ExecutionConfig>(saved) })} useAdminExecutionCredentialHook={credential} useExecutionPolicy={useLocal} />);
  const tab = await screen.findByRole('tab', { name: /^Local CLI/ });
  await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
  expect(await screen.findByText('Codex')).toBeVisible();
  expect(port.detectLocalAgents).toHaveBeenCalledOnce();
  expect(screen.queryByText(DEPLOYED_LOCAL_CLI_NOTE)).not.toBeInTheDocument();
});

it('deployed composer hides the portaled Local CLI row and code-agent list, even for a saved CLI', async () => {
  const runtime = { listAgents: vi.fn(async () => [{ id: 'codex', name: 'Codex', available: true }]), rescanAgents: vi.fn(async () => []), daemonOnline: vi.fn(async () => true) };
  const write = vi.fn();
  render(<AssistantDock
    useExecutionPolicy={useDeployed} useAdminLocale={() => 'en'}
    useExecutionConfig={() => ({ executionConfig: saved, executionConfigRef: { current: saved }, setExecutionConfig: write, handleExecutionModeChange: write, hasStoredAdminKey: true, configLoaded: true })}
    useChats={() => ({ conversations: [], activeId: null, paneKey: 'deployed-test', initialMessages: [], select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn(), onMessagesChange: vi.fn(), persistUserTurn: async () => {}, ensureConversationId: async () => null })}
    useByokRuntime={() => ({ byokRuntime: { model: 'test-model', models: [] }, handleByokModelChange: vi.fn() })}
    useLocalCliSelection={() => ({ localCliSelection: { agentId: 'codex' }, handleLocalCliSelectionChange: write })}
    useRuntimeAccess={() => runtime}
    useComposerCapabilities={() => ({ composerCapabilities: emptyComposerCapabilityProjection() })}
    useAssistantTransport={() => ({ startRun: vi.fn(async () => ({ runId: 'test' })), stopRun: async () => {}, reattachRun: async () => {}, fetchRunStatus: async () => null })}
    useAttachmentUploader={() => async () => []} useAttachmentValidator={() => async () => []}
  />);
  await screen.findByText(DEPLOYED_LOCAL_CLI_NOTE);
  fireEvent.click(screen.getByRole('button', { name: 'Choose AI runtime' }));
  const dialog = await screen.findByRole('dialog', { name: 'Choose AI runtime' });
  expect(dialog.parentElement).toBe(document.body);
  expect(screen.queryByRole('button', { name: 'Use Local CLI offline' })).not.toBeInTheDocument();
  expect(screen.getByText('Use Local CLI').closest('button')).not.toBeVisible();
  expect(screen.getByRole('button', { name: 'Use API · BYOK' })).toBeVisible();
  expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  expect(screen.queryByText('Code agent')).not.toBeInTheDocument();
  expect(runtime.listAgents).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

it('has an explicit translation for the saved-choice note in every offered admin locale', () => {
  for (const { code } of ADMIN_LOCALES) {
    const copy = t(code, DEPLOYED_LOCAL_CLI_NOTE);
    expect(copy.trim()).not.toBe('');
    if (code !== 'en') expect(copy, code).not.toBe(DEPLOYED_LOCAL_CLI_NOTE);
  }
});
