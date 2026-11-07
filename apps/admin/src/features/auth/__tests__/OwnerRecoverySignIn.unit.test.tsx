import { ApiError } from '@/lib/api';
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { OwnerRecoverySignIn } from '../OwnerRecoverySignIn';

it('keeps saved login passwords out of the recovery code, hidden and revealed', () => {
  render(<OwnerRecoverySignIn />);
  fireEvent.click(screen.getByText('Lost your owner password?'));
  const code = screen.getByLabelText('Recovery code');
  expect(code).toHaveAttribute('type', 'password');
  expect(code).toHaveAttribute('autocomplete', 'new-password');
  fireEvent.click(screen.getByRole('button', { name: 'Show Recovery code' }));
  expect(code).toHaveAttribute('type', 'text');
  expect(code).toHaveAttribute('autocomplete', 'new-password');
});

it('recovers using the code and new password without keeping either after success', async () => {
  const recover = vi.fn(async () => {});
  render(<OwnerRecoverySignIn recover={recover} />);
  fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'a'.repeat(64) } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-owner-password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-owner-password' } });
  fireEvent.click(screen.getByText('Recover owner account'));
  await screen.findByText(/Owner password reset. Sign in/);
  expect(recover).toHaveBeenCalledWith({ code: 'a'.repeat(64), password: 'new-owner-password' });
  expect(screen.queryByDisplayValue('new-owner-password')).toBeNull();
  expect(screen.queryByDisplayValue('a'.repeat(64))).toBeNull();
});


it('retains a rate-limit explanation and redacted copy details instead of suggesting another code', async () => {
  const recover = vi.fn(async () => { throw new ApiError('Too many recovery attempts. Wait a minute and try again.', 429, 'LIMITED'); });
  render(<OwnerRecoverySignIn recover={recover} />);
  fireEvent.click(screen.getByText('Lost your owner password?'));
  fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'a'.repeat(64) } });
  for (const label of ['New password', 'Confirm new password']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'private-password' } });
  fireEvent.click(screen.getByText('Recover owner account'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many recovery attempts. Wait a minute and try again.');
  fireEvent.click(screen.getByText('Show details'));
  expect(screen.getByRole('button', { name: 'Copy details' })).toBeTruthy();
  expect(document.body.textContent).not.toContain('private-password');
});

it('routes sign-in recovery copy through the supplied translator', () => {
  render(<OwnerRecoverySignIn t={text => `translated:${text}`} />);
  expect(screen.getByText('translated:Lost your owner password?')).toBeTruthy();
  expect(screen.getByLabelText('translated:Recovery code')).toBeTruthy();
});
