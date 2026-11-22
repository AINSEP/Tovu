import { formatUserFacingError } from '@jini-ai/core';
import { ApiError } from '@/lib/admin-http/request';
import { render, screen, fireEvent } from "@/__tests__/render-with-jini-kits";
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


it('retains a rate-limit explanation without copy details instead of suggesting another code', async () => {
  const recover = vi.fn(async () => { throw new ApiError({ message: 'Too many recovery attempts. Wait a minute and try again.', status: 429 }, { code: 'LIMITED' }); });
  render(<OwnerRecoverySignIn recover={recover} />);
  fireEvent.click(screen.getByText('Lost your owner password?'));
  fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'a'.repeat(64) } });
  for (const label of ['New password', 'Confirm new password']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'private-password' } });
  fireEvent.click(screen.getByText('Recover owner account'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many recovery attempts. Wait a minute and try again.');
  expect(screen.queryByText('Copy details'), 'Anonymous recovery failures do not offer Copy details').toBeNull();
  expect(document.body.textContent).not.toContain('private-password');
});

it('routes sign-in recovery copy through the supplied translator', () => {
  render(<OwnerRecoverySignIn t={text => `translated:${text}`} />);
  expect(screen.getByText('translated:Lost your owner password?')).toBeTruthy();
  expect(screen.getByLabelText('translated:Recovery code')).toBeTruthy();
});

it('renders the controller state returned by the injected useOwnerRecoverySignInHook', () => {
  const submit = vi.fn();
  render(
    <OwnerRecoverySignIn
      useOwnerRecoverySignInHook={() => ({ code: '', setCode: vi.fn(), password: '', setPassword: vi.fn(), confirmation: '', setConfirmation: vi.fn(), failure: null, busy: false, message: 'Injected status message', submit })}
    />,
  );
  fireEvent.click(screen.getByText('Lost your owner password?'));
  expect(screen.getByRole('status')).toHaveTextContent('Injected status message');
});

it('shows the error ID without Copy details for an anonymous recovery failure', () => {
  const failure = formatUserFacingError({ message: 'Recovery could not finish.', action: 'Ask the host operator for help.', step: 'owner-recovery-redeem', cause: 'Recovery failed.' }, { errorId: 'recovery-incident' });
  render(<OwnerRecoverySignIn useOwnerRecoverySignInHook={() => ({ code: '', setCode: vi.fn(), password: '', setPassword: vi.fn(), confirmation: '', setConfirmation: vi.fn(), failure, busy: false, message: '', submit: vi.fn() })} />);
  fireEvent.click(screen.getByText('Lost your owner password?'));
  expect(screen.getByRole('alert'), 'Anonymous recovery failures show the error ID').toHaveTextContent('recovery-incident — Report this error ID.');
  expect(screen.queryByText('Copy details'), 'Anonymous recovery failures do not offer Copy details').toBeNull();
});
