import { cleanup, render, screen } from '@/__tests__/render-with-jini-kits';
import { afterEach, expect, it } from 'vitest';
import { AdminModulesProvider } from '../AdminModulesProvider';
import { SecurityModulePanel } from '../security-module.hooks';

afterEach(cleanup);

it('BUG T-B07: the Security panel shows its loading status while the admin scope is pending', () => {
  render(<AdminModulesProvider permissions={['*']} useAdminLocaleHook={() => 'en'} useAdminModulesHook={() => null}>
    <SecurityModulePanel useAdminLocaleHook={() => 'en'} />
  </AdminModulesProvider>);

  expect(screen.getByRole('status').textContent).toBe('Loading credentials…');
});
