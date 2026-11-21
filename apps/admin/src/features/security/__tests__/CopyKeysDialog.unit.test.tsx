import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { CopyKeysDialog } from '../CopyKeysDialog';
import { useCopyKeys, type CopyKeysPort } from '../hooks/use-copy-keys.hooks';
import { fakeCopyKeysPort, t } from './copy-keys.fixture';

function Harness({ port }: { port: CopyKeysPort }) {
  const dialog = useCopyKeys({ t }, { port });
  return <><button onClick={dialog.show}>Open</button><CopyKeysDialog dialog={dialog} t={t} /></>;
}

it('approves one Shared Keys reference without source-site or overwrite controls', async () => {
  const port = fakeCopyKeysPort();
  render(<Harness port={port} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(await screen.findByRole('dialog', { name: 'Use a saved key' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('radio', { name: 'Main · OpenAI' }));
  expect(screen.queryByText('Overwrite existing')).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Use this key on this site' }));
  expect(await screen.findByText('Granted to this site')).toBeVisible();
  expect(port.copyCredentials).toHaveBeenCalledWith({ sourceSiteId: 'shared-keys', ids: ['one'], overwrite: false });
});

it('shows omitted saved keys for each source', async () => {
  const port = fakeCopyKeysPort([{ siteId: 'shared-keys', name: 'Shared Keys', keys: [
    { kind: 'vendor', id: 'one', label: 'A key', provider: 'OpenAI', siteName: 'Site A', omittedCount: 1 },
    { kind: 'vendor', id: 'two', label: 'B key', provider: 'OpenAI', siteName: 'Site B', omittedCount: 2 },
    { kind: 'vendor', id: 'three', label: 'Shared key', provider: 'OpenAI' },
  ] }]);
  render(<Harness port={port} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(await screen.findByText('Site A: 1 more not shown'), 'Site A shows its omitted saved keys').toBeVisible();
  expect(screen.getByText('Site B: 2 more not shown'), 'Site B shows its omitted saved keys').toBeVisible();
  expect(screen.getAllByRole('radio').map(radio => radio.getAttribute('value')), 'only the three real keys are selectable').toEqual(['one', 'two', 'three']);
});

it('explains how to enter a new key when Shared Keys is empty', async () => {
  render(<Harness port={fakeCopyKeysPort([])} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(await screen.findByText('No saved keys are available. Use Add credential to enter a new key.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Use this key on this site' })).toBeDisabled();
});
