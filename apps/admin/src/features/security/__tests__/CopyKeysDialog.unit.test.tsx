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

it('explains how to enter a new key when Shared Keys is empty', async () => {
  render(<Harness port={fakeCopyKeysPort([])} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(await screen.findByText('No saved keys are available. Use Add credential to enter a new key.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Use this key on this site' })).toBeDisabled();
});
