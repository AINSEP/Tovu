import { cleanup, fireEvent, render, screen, waitFor, within } from '@/__tests__/render-with-jini-kits';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitProvider } from '@jini-ai/ui-kit/react';
import { createAdmin } from '@jini-ai/admin/core/module';
import { createOverlayController } from '@jini-ai/admin/react/overlays';
import { createMemorySecurityApi, createMemoryOtherCredentials, createMemoryRootKey } from '@jini-ai/admin/security/adapters/memory';
import { navigate } from '@jini-ai/admin/shell/lib/router';
import { AdminModulesProvider } from '../AdminModulesProvider';
import { AdminModulesContext, createHostAdminScope, useModulePanel } from '../modules.hooks';
import { createHostSecurityModule, SecurityModulePanel, type SecurityOwnerPorts } from '../security-module.hooks';
import type { UseAdminLocaleHook } from '@jini-ai/admin/react/kit';
import type { Runtime } from '../module-context';
import { tovuKit } from '../kit';

vi.mock('@jini-ai/admin/shell/lib/router', async (importOriginal) => ({ ...await importOriginal<typeof import('@jini-ai/admin/shell/lib/router')>(), navigate: vi.fn() }));

const disposers: (() => void)[] = [];
afterEach(() => { cleanup(); for (const dispose of disposers.splice(0)) dispose(); vi.mocked(navigate).mockClear(); });

const CODES = Array.from({ length: 10 }, (_, index) => `fixture-code-${index + 1}`);
/** Stub owner ports: every control reports an owner so all three render. */
function ownerPorts(): SecurityOwnerPorts {
  return {
    mfa: { status: async () => ({ isOwner: true, available: true, enrolled: false }), enroll: vi.fn(), confirm: vi.fn(), remove: vi.fn() },
    recovery: { status: async () => ({ isOwner: true, available: true, desktopOwnerReset: false }), issue: vi.fn(async () => ({ codes: CODES })), reset: vi.fn(), recover: vi.fn() },
    passkeys: { status: async () => ({ isOwner: true, credentials: [] }), enroll: vi.fn(), confirm: vi.fn(), remove: vi.fn() },
  };
}
const useAdminLocaleHook: UseAdminLocaleHook = () => 'en';
const securityPorts = () => ({ securityApi: createMemorySecurityApi({}), otherCredentials: createMemoryOtherCredentials({}), rootKey: createMemoryRootKey({}) });

function mount({ permissions = ['*'], grantsReady = true, tab = null as string | null, owner = ownerPorts() } = {}) {
  const runtime = createHostAdminScope({ permissions, useAdminLocaleHook: () => 'en' }, { securityPorts: securityPorts(), securityOwnerPorts: owner, grantsReady });
  disposers.push(() => { runtime.admin.dispose(); runtime.overlays.dispose(); });
  render(<KitProvider kit={tovuKit}><AdminModulesProvider useAdminLocaleHook={() => 'en'} permissions={permissions} grantsReady={grantsReady} useAdminModulesHook={() => runtime}><SecurityModulePanel tabId={tab} useAdminLocaleHook={useAdminLocaleHook} /></AdminModulesProvider></KitProvider>);
  return { owner };
}
const tabNames = () => screen.getAllByRole('tab').map(tab => tab.textContent?.trim());

describe('Security host panel', () => {
  it('signed in, grants loading: Access Tokens and owner controls render, no site-key tab, ?tab=site-key lands on Access Tokens', async () => {
    mount({ grantsReady: false, tab: 'site-key' });
    expect(await screen.findByRole('tab', { name: 'Access Tokens' })).toHaveAttribute('aria-selected', 'true');
    expect(tabNames()).toEqual(['Access Tokens']);
    expect(await screen.findByRole('heading', { name: 'Recovery codes' })).toBeInTheDocument();
  });

  it('signed in, site-key denied after load: the same fallback', async () => {
    mount({ permissions: ['system.publish'], tab: 'site-key' });
    expect(await screen.findByRole('tab', { name: 'Access Tokens' })).toHaveAttribute('aria-selected', 'true');
    expect(tabNames()).toEqual(['Access Tokens']);
  });

  it('site-key granted: ?tab=site-key opens the root-key tab and a tab change writes ?tab=site-key with replace', async () => {
    mount({ tab: 'site-key' });
    expect(await screen.findByRole('tab', { name: 'Site key' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Access Tokens' }));
    expect(navigate).toHaveBeenLastCalledWith({ routePath: '/access-tokens?tab=access-tokens' }, { replace: true });
    fireEvent.click(screen.getByRole('tab', { name: 'Site key' }));
    expect(navigate).toHaveBeenLastCalledWith({ routePath: '/access-tokens?tab=site-key' }, { replace: true });
  });

  it('an unknown tab falls back to Access Tokens', async () => {
    mount({ tab: 'nope' });
    expect(await screen.findByRole('tab', { name: 'Access Tokens' })).toHaveAttribute('aria-selected', 'true');
  });

  it('denied page: a scope without the session grant shows the denied notice', async () => {
    const feature = createHostSecurityModule({ useAdminLocaleHook: () => 'en' }, { ownerPorts: ownerPorts() });
    const admin = createAdmin({ modules: [feature.react.module], ports: securityPorts() }, { permissions: [] });
    const overlays = createOverlayController({});
    disposers.push(() => { admin.dispose(); overlays.dispose(); });
    const runtime = { permissionKey: '[]', admin, overlays, picker: null as never, bindings: { security: feature.react } } as unknown as Runtime;
    render(<KitProvider kit={tovuKit}><AdminModulesProvider useAdminLocaleHook={() => 'en'} permissions={[]} grantsReady useAdminModulesHook={() => runtime}><SecurityModulePanel tabId={null} useAdminLocaleHook={useAdminLocaleHook} /></AdminModulesProvider></KitProvider>);
    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('owner controls render in order TOTP, recovery codes, passkeys, and recovery issues ten codes', async () => {
    const { owner } = mount();
    await screen.findByRole('heading', { name: 'Passkeys' });
    await screen.findByRole('heading', { name: 'Authenticator app' });
    const controls = document.querySelector('[data-jini-part="security.owner-controls"]') as HTMLElement;
    const headings = within(controls).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent);
    expect(headings.slice(0, 3)).toEqual(['Authenticator app', 'Recovery codes', 'Passkeys']);
    const recovery = within(controls).getByRole('heading', { name: 'Recovery codes' }).closest('section') as HTMLElement;
    fireEvent.change(within(recovery).getAllByLabelText('Current owner password')[0]!, { target: { value: 'fixture-password' } });
    fireEvent.click(within(recovery).getByRole('button', { name: 'Generate recovery codes' }));
    await waitFor(() => expect(owner.recovery.issue).toHaveBeenCalledTimes(1));
    for (const code of CODES) expect(await within(recovery).findByText(code, { exact: false })).toBeInTheDocument();
  });
});

it('resets the desktop owner password only after entering matching values', async () => {
  const user = userEvent.setup();
  const owner = ownerPorts();
  const reset = vi.fn<SecurityOwnerPorts['recovery']['reset']>().mockResolvedValue(undefined);
  owner.recovery = { ...owner.recovery, status: async () => ({ isOwner: true, available: true, desktopOwnerReset: true }), reset };
  const runtime = createHostAdminScope({ permissions: ['*'], useAdminLocaleHook }, {
    securityPorts: securityPorts(), securityOwnerPorts: owner,
  });
  disposers.push(() => { runtime.admin.dispose(); runtime.overlays.dispose(); });
  function AccessTokens() {
    return <>{useModulePanel({ moduleId: 'security', pageId: 'secrets', route: {
      view: null, params: {}, query: new URLSearchParams('tab=access-tokens'),
    } }).content}</>;
  }
  render(<AdminModulesContext.Provider value={runtime}><AccessTokens /></AdminModulesContext.Provider>);
  await user.click(await screen.findByText('Reset owner password', { selector: 'summary' }));
  await user.type(screen.getByLabelText('New owner password', { selector: 'input' }), 'fixture-new-password');
  const confirmation = screen.getByLabelText('Confirm new owner password', { selector: 'input' });
  const submit = screen.getByRole('button', { name: 'Reset password and sign out sessions' });
  await user.type(confirmation, 'wrong-confirmation');
  await user.click(submit);
  expect(screen.getByText(/The passwords do not match/)).toBeInTheDocument();
  expect(reset).not.toHaveBeenCalled();
  await user.clear(confirmation);
  await user.type(confirmation, 'fixture-new-password');
  await user.click(submit);

  expect(reset).toHaveBeenCalledExactlyOnceWith({ password: 'fixture-new-password' });
  expect(await screen.findByText('Owner password reset. All sessions and recovery codes were invalidated. Reopen the site or sign in with your new password.')).toBeInTheDocument();
});

it('shows a loading status while the Security module scope is not ready', () => {
  const locale = vi.fn<UseAdminLocaleHook>(() => 'es');
  render(<SecurityModulePanel tabId="site-key" useAdminLocaleHook={locale} />);
  // No module scope mounted: the panel shows the host's translated fallback through the injected hook.
  expect(screen.getByRole('status').textContent).toBe('Loading credentials…');
  expect(locale).toHaveBeenCalledWith({}, {});
});
