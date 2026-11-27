import userEvent from "@testing-library/user-event";
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

it("keeps a revealed export password available when clipboard access fails and reports a successful retry", async () => {
  const password = "fixture-export-copy";
  const share: SiteShare = { shareId: "export-2", file: "site.tovu.zip", bytes: 17, url: null,
    status: "active", createdAt: "2026-11-06T12:00:00Z", downloadUrl: "/download/export-2", hasEncryptedKeys: true };
  const writeText = vi.fn<(text: string) => Promise<void>>()
    .mockRejectedValueOnce(new DOMException("Clipboard permission denied", "NotAllowedError"))
    .mockResolvedValueOnce(undefined);
  const port = createFakeSiteTransferPort({
    savedKeysAccess: async () => ({ isOwner: true }),
    listShares: async () => ({ shares: [share] }),
    revealSharePassword: async ({ shareId }) => {
      if (shareId !== "export-2") throw new Error("Wrong export");
      return { password };
    },
  });
  const t = (text: string) => text;
  const user = userEvent.setup();
  render(<FetchQueryProvider><SiteExportTab t={t}
    useExport={() => useSiteExport({ port, t }, { clipboard: { writeText } })} /></FetchQueryProvider>);
  await user.click(await screen.findByRole("button", { name: "Reveal password" }));
  const field = await screen.findByLabelText("Export password");
  await user.click(screen.getByRole("button", { name: "Copy", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy the password. Copy it manually.");
  expect(field).toHaveValue(password);
  await user.click(screen.getByRole("button", { name: "Copy", exact: true }));
  expect(await screen.findByRole("button", { name: "Copied", exact: true })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(writeText.mock.calls).toEqual([[password], [password]]);
});
