import { ApiError } from '@/lib/api';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RecoveryCodesCard } from '../RecoveryCodesCard';
import type { OwnerRecoveryPort } from '../../../lib/owner-recovery-api';

const port = (owner = true): OwnerRecoveryPort => ({
  status: async () => ({ isOwner: owner, available: owner, desktopOwnerReset: owner }),
  issue: vi.fn(async () => ({ codes: Array.from({ length: 10 }, (_, i) => String(i).padStart(64, 'a')) })),
  reset: vi.fn(async () => {}), recover: vi.fn(async () => {}),
});

describe('owner recovery card', () => {
  it('uses the current password for proof and new-password for the desktop reset, even when revealed', async () => {
    render(<RecoveryCodesCard port={port()} />);
    const proof = await screen.findByLabelText('Current owner password');
    expect(proof).toHaveAttribute('autocomplete', 'current-password');
    fireEvent.click(screen.getByRole('button', { name: 'Show Current owner password' }));
    expect(proof).toHaveAttribute('type', 'text');
    expect(proof).toHaveAttribute('autocomplete', 'current-password');
    fireEvent.click(screen.getByText('Reset owner password'));
    for (const label of ['New owner password', 'Confirm new owner password']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('autocomplete', 'new-password');
      fireEvent.click(screen.getByRole('button', { name: `Show ${label}` }));
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('autocomplete', 'new-password');
    }
  });

  it('hides recovery actions from staff', async () => {
    render(<RecoveryCodesCard port={port(false)} />);
    await waitFor(() => expect(screen.queryByText('Loading owner recovery…')).toBeNull());
    expect(screen.queryByText('Generate recovery codes')).toBeNull();
    expect(screen.queryByText('Reset owner password')).toBeNull();
  });
  it('shows a new kit once and clears the password after issue', async () => {
    const p = port();
    render(<RecoveryCodesCard port={p} />);
    await screen.findByText('Generate recovery codes');
    fireEvent.change(screen.getByLabelText('Current owner password'), { target: { value: 'private-password' } });
    fireEvent.click(screen.getByText('Generate recovery codes'));
    await screen.findByText('Download codes');
    expect(p.issue).toHaveBeenCalledWith({ password: 'private-password' });
    expect(screen.queryByDisplayValue('private-password')).toBeNull();
    fireEvent.click(screen.getByText('I saved these codes'));
    expect(screen.queryByText('Download codes')).toBeNull();
  });
});


it('keeps the status store failure and offers copyable details', async () => {
  const p = port();
  p.status = async () => { throw new ApiError('The identity database is offline. Ask the host operator to reconnect it.', 503); };
  render(<RecoveryCodesCard port={p} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('The identity database is offline');
  fireEvent.click(screen.getByText('Show details'));
  expect(screen.getByRole('button', { name: 'Copy details' })).toBeTruthy();
});

it.each(['issue', 'reset'] as const)('preserves the server explanation when %s fails', async action => {
  const p = port();
  p[action] = vi.fn(async () => { throw new ApiError('Too many recovery attempts. Wait a minute and try again.', 429); });
  render(<RecoveryCodesCard port={p} />);
  await screen.findByText('Generate recovery codes');
  if (action === 'reset') fireEvent.click(screen.getByText('Reset owner password'));
  const labels = action === 'issue' ? ['Current owner password'] : ['New owner password', 'Confirm new owner password'];
  for (const label of labels) fireEvent.change(screen.getByLabelText(label), { target: { value: 'private-password' } });
  fireEvent.click(screen.getByText(action === 'issue' ? 'Generate recovery codes' : 'Reset password and sign out sessions'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many recovery attempts');
  fireEvent.click(screen.getByText('Show details'));
  expect(screen.getByRole('button', { name: 'Copy details' })).toBeTruthy();
  expect(document.body.textContent).not.toContain('private-password');
});

it('translates recovery controls with the page translator', async () => {
  render(<RecoveryCodesCard port={port()} t={text => `translated:${text}`} />);
  expect(await screen.findByText('translated:Recovery codes')).toBeTruthy();
  expect(screen.getByLabelText('translated:Current owner password')).toBeTruthy();
});


it('does not read recovery status again when only the page language changes', async () => {
  const p = port();
  p.status = vi.fn(p.status);
  const { rerender } = render(<RecoveryCodesCard port={p} t={text => text} />);
  await screen.findByText('Recovery codes');
  rerender(<RecoveryCodesCard port={p} t={text => `translated:${text}`} />);
  expect(screen.getByText('translated:Recovery codes')).toBeTruthy();
  expect(p.status).toHaveBeenCalledTimes(1);
});

it('includes the enrolled owner authenticator proof when rotating the recovery kit', async () => {
  const p = port();
  render(<RecoveryCodesCard port={p} />);
  await screen.findByText('Generate recovery codes');
  fireEvent.change(screen.getByLabelText('Current owner password'), { target: { value: 'owner-password' } });
  fireEvent.change(screen.getByLabelText('Authenticator code (if enabled)'), { target: { value: '123456' } });
  fireEvent.click(screen.getByText('Generate recovery codes'));
  await screen.findByText('Download codes');
  expect(p.issue).toHaveBeenCalledExactlyOnceWith({ password: 'owner-password', code: '123456' });
  expect(screen.queryByDisplayValue('owner-password')).toBeNull();
  expect(screen.queryByDisplayValue('123456')).toBeNull();
});
