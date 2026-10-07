import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionTab, I18nProvider, SETTINGS_DIALOG_DICTIONARIES } from '@jini-ai/ui';
import { DEFAULT_EXECUTION_CONFIG } from '@/lib/execution-settings';
import { createAgentPresentationPort } from '../ai-agent-presentation';
import { aiAgentPanelDictionaries } from '../settings-execution-i18n';

afterEach(cleanup);

describe('D-21 shared agent card integration', () => {
  it.each(['', '  \n '])('omits the real divider and tagline for description %j', async (description) => {
    const agent = { id: 'reasonix', label: 'DeepSeek Reasonix', installed: true, description };
    const port = createAgentPresentationPort({
      port: { detectLocalAgents: async () => [agent], testConnection: async () => ({ ok: true }) },
      onAgents: () => {},
    });
    const { container } = render(
      <I18nProvider initialLocale="en" dictionaries={aiAgentPanelDictionaries({ dictionaries: SETTINGS_DIALOG_DICTIONARIES })} syncDocumentAttributes={false}>
        <ExecutionTab config={{ ...DEFAULT_EXECUTION_CONFIG, mode: 'local-cli' }} onConfigChange={() => {}} port={port} ariaLabel="AI agent" agentHandle="settings-ai-agent" />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByText('DeepSeek Reasonix')).toBeInTheDocument());
    expect(container.querySelector('.jini-agent-card-name')?.textContent).toBe('DeepSeek Reasonix');
    expect(container.querySelector('.jini-agent-card-name-divider')).toBeNull();
    expect(container.querySelector('.jini-agent-card-tagline')).toBeNull();
    expect(screen.getByRole('tablist', { name: 'AI agent' })).toBeInTheDocument();
    expect(container.querySelector('[aria-label="Execution mode"]')).toBeNull();
  });
});
