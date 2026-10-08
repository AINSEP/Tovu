/** Keep measurement assertions pointed at the real package hooks and the shipped host mount. */
import { useRedirects, useHitCountCell } from '@jini-ai/admin/redirects/react';
import { useWiredAdminLocale } from '../hooks/use-admin-locale.hooks';
import { Redirects as HostRedirects } from '../features/redirects';
import { useAdminModules, useModuleProviderContent } from '../integrations/jini-admin/modules.hooks';
import { createRedirectsTranslator, redirectsHostPorts } from '../integrations/jini-admin/redirects-ports';

/** Exercise the same real HTTP/refresh owners as the module, retaining the old hook assertions. */
export function useWiredRedirects() {
  const locale = useWiredAdminLocale();
  return useRedirects({ api: redirectsHostPorts.redirectsApi }, { locale, t: createRedirectsTranslator({ locale }), events: redirectsHostPorts.redirectsEvents });
}

/** Share the host API and fetch-query client with the measured list for the fan-out probe. */
export function useWiredHitCountCell({ redirectId, t }: { redirectId: string; t: (key: string) => string }) {
  return useHitCountCell({ redirectId, api: redirectsHostPorts.redirectsApi }, { t });
}

/** Supply the scope that production's App owns; the screen and shared cache still mount normally. */
export function Redirects() {
  const runtime = useAdminModules({ permissions: ['*'] });
  return useModuleProviderContent({ runtime, children: <HostRedirects /> });
}
