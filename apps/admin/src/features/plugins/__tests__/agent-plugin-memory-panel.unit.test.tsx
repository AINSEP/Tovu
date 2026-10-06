// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { AgentPluginMemoryPanel } from '../AgentPluginMemoryPanel';
import { AgentPluginDetailsModal } from '../AgentPluginDetailsModal';
import { useAgentPluginMemory } from '../hooks/use-agent-plugin-memory.hooks';
import type { AgentPluginMemoryPort, PluginMemoryListing } from '../hooks/agent-plugin-memory-port.hooks';

const memoryPort = vi.hoisted(() => ({ read: vi.fn(), saveNote: vi.fn() }));
vi.mock('../hooks/agent-plugin-memory-dependencies.hooks', () => ({ defaultAgentPluginMemoryPort: memoryPort }));
vi.mock('@/hooks/use-admin-locale.hooks', () => ({ useAdminLocale: () => 'en' }));

const t = (key: string) => key;
const empty = (): PluginMemoryListing => ({ pluginId: 'higgsfield-media', notes: [], learned: [],
  limits: { learned: 1048576, notes: 16384, files: 128 } });

function MemoryHarness({ port }: { port: AgentPluginMemoryPort }) {
  const controller = useAgentPluginMemory({ pluginId: 'higgsfield-media', port, t });
  return <AgentPluginMemoryPanel controller={controller} />;
}

beforeEach(() => {
  memoryPort.read.mockReset().mockResolvedValue(empty());
  memoryPort.saveNote.mockReset().mockResolvedValue(empty());
});

test('the editor uses padded admin form primitives and accessible labels, with Save below the fields', async () => {
  const { container } = render(<MemoryHarness port={memoryPort} />);
  const path = screen.getByRole('textbox', { name: 'Note file' });
  const notes = screen.getByRole('textbox', { name: 'Project notes' });
  await waitFor(() => expect(path).toBeEnabled());
  expect(container.firstElementChild).toHaveClass('card', 'field-group');
  expect(path.parentElement).toHaveClass('field');
  expect(notes.parentElement).toHaveClass('field');
  expect(notes).toHaveAttribute('rows', '12');
  const save = screen.getByRole('button', { name: 'Save note' });
  expect(save).toHaveClass('btn-primary');
  expect(notes.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.type(notes, 'Keep the brand voice calm.');
  await userEvent.click(save);
  expect(memoryPort.saveNote).toHaveBeenCalledWith({ pluginId: 'higgsfield-media', entryPath: 'project.md', text: 'Keep the brand voice calm.' });
});

test('empty memory explains both named sections, and populated memory renders each list separately', async () => {
  const { unmount } = render(<MemoryHarness port={memoryPort} />);
  expect(await screen.findByText('No note files yet. Save a project note to get started.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Note files' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Learned knowledge' })).toBeInTheDocument();
  expect(screen.getByText('Nothing learned yet. The assistant saves what it verifies here.')).toBeInTheDocument();
  unmount();

  memoryPort.read.mockResolvedValue({ ...empty(), notes: [{ relativePath: 'brand.md', text: 'Brand notes' }],
    learned: [{ relativePath: 'account.json', text: 'Verified account facts' }] });
  render(<MemoryHarness port={memoryPort} />);
  const noteFiles = screen.getByRole('region', { name: 'Note files' });
  const learned = screen.getByRole('region', { name: 'Learned knowledge' });
  expect(await within(noteFiles).findByRole('button', { name: 'brand.md' })).toBeInTheDocument();
  expect(within(learned).getByText('account.json')).toBeInTheDocument();
  expect(within(learned).getByText('Verified account facts')).toBeInTheDocument();
  expect(screen.queryByText('No note files yet. Save a project note to get started.')).not.toBeInTheDocument();
  expect(screen.queryByText('Nothing learned yet. The assistant saves what it verifies here.')).not.toBeInTheDocument();
});

test('Memory and Package files switch the header and selected ARIA tab together in both directions', async () => {
  render(<AgentPluginDetailsModal plugin={{ id: 'higgsfield-media', displayName: 'Higgsfield Media' }} t={t}
    onClose={vi.fn()} useDetails={() => ({ files: [], selectedFile: null, selectFile: vi.fn() })} />);
  const packageTab = screen.getByRole('tab', { name: 'Package files' });
  const memoryTab = screen.getByRole('tab', { name: 'Memory' });
  expect(packageTab).toHaveAttribute('aria-selected', 'true');
  expect(memoryTab).toHaveAttribute('aria-selected', 'false');
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Higgsfield Media package files preview');

  await userEvent.click(memoryTab);
  expect(memoryTab).toHaveAttribute('aria-selected', 'true');
  expect(packageTab).toHaveAttribute('aria-selected', 'false');
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Higgsfield Media Memory preview');
  // Neither tab carries a subtitle (owner, 2026-10-06).
  expect(screen.queryByText('Edit project notes and review what this plugin has learned.')).not.toBeInTheDocument();
  expect(screen.queryByText("Read-only view of this plugin's files; nothing runs from this screen.")).not.toBeInTheDocument();

  await userEvent.click(packageTab);
  expect(packageTab).toHaveAttribute('aria-selected', 'true');
  expect(memoryTab).toHaveAttribute('aria-selected', 'false');
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Higgsfield Media package files preview');
  expect(screen.queryByText("Read-only view of this plugin's files; nothing runs from this screen.")).not.toBeInTheDocument();
  expect(screen.queryByText('Edit project notes and review what this plugin has learned.')).not.toBeInTheDocument();
});
