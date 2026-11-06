import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FetchQueryProvider } from '@/__tests__/fetch-query-provider.test-helper';
import { SiteExportTab } from '../SiteExportTab';
import { useSiteExport } from '../hooks/use-site-transfer.hooks';
import { createFakeSiteTransferPort, type SiteShare } from '../hooks/site-transfer-dependencies.hooks';

it('keeps export-password reveal, value and copy human-only while retaining human actions', async () => {
  const password = 'fixture-export-secret';
  const share: SiteShare = { shareId: 'secret-export', file: 'backup.zip', bytes: 40, url: null,
    status: 'active', createdAt: '2026-11-05T12:00:00Z', downloadUrl: '/download/secret-export', hasEncryptedKeys: true };
  const writeText = vi.fn().mockResolvedValue(undefined);
  const revealSharePassword = vi.fn().mockResolvedValue({ password });
  const port = createFakeSiteTransferPort({ savedKeysAccess: async () => ({ isOwner: true }),
    listShares: async () => ({ shares: [share] }), revealSharePassword });
  render(<FetchQueryProvider><SiteExportTab t={text => text}
    useExport={() => useSiteExport({ port, t: text => text }, { clipboard: { writeText } })} /></FetchQueryProvider>);
  const reveal = await screen.findByRole('button', { name: 'Reveal password' });
  expect(reveal).not.toHaveAttribute('data-agent-element');
  expect(reveal).toHaveAttribute('data-agent-private', '');
  expect(revealSharePassword).not.toHaveBeenCalled();
  fireEvent.click(reveal);
  const field = await screen.findByLabelText('Export password');
  expect(field).toHaveValue(password);
  expect(field.closest('[data-agent-private]')).not.toBeNull();
  const copy = screen.getByRole('button', { name: 'Copy' });
  expect(copy).not.toHaveAttribute('data-agent-element');
  expect(copy.closest('[data-agent-private]')).not.toBeNull();
  fireEvent.click(copy);
  await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(password));
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.queryByLabelText('Export password')).toBeNull();
});
