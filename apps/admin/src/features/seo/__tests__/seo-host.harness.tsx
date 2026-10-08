import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FetchQueryProvider } from '@jini-ai/ui/fetch-query';
import { buildSeoSettingsPatch as buildPatch } from '@jini-ai/admin/seo';
import { resolveSeoTabs as resolveTabs, sitemapStateLabel as stateLabel } from '@jini-ai/admin/seo/react';
import { createMemorySeoApi } from '@jini-ai/admin/seo/adapters/memory';
import { Seo } from '..';
import { AdminModulesContext, createHostAdminScope } from '../../../integrations/jini-admin/modules.hooks';
import { createSeoTranslator } from '../../../integrations/jini-admin/seo-ports';

let runtime: ReturnType<typeof createHostAdminScope> | undefined;

/** The retained router test clicks the real module tabs through the surviving host boundary. */
export async function mountSeoHost() {
  runtime = createHostAdminScope({ permissions: ['admin.seo.manage'] }, {
    seoPorts: { seoApi: createMemorySeoApi({}) }, useSeoLocaleHook: () => 'en',
  });
  render(<FetchQueryProvider><AdminModulesContext.Provider value={runtime}><Seo tabId={null} /></AdminModulesContext.Provider></FetchQueryProvider>);
  await screen.findByRole('tab', { name: 'Site defaults' });
}

/** Dispose the real scope and mounted controllers after each retained host contract test. */
export function disposeSeoHost() {
  cleanup();
  runtime?.admin.dispose();
  runtime?.overlays.dispose();
  runtime = undefined;
}

// Legacy test ABIs only: each wrapper calls the public owner; no screen logic is copied.
export const buildSeoSettingsPatch = (form: FormData) => buildPatch({ form });
export const resolveSeoTabs = (locale: string) => resolveTabs({}, { t: createSeoTranslator({ locale }) });
export const sitemapStateLabel = (locale: string, sitemapEnabled: boolean) => stateLabel({ sitemapEnabled }, { t: createSeoTranslator({ locale }) });
export function goToSeoTab(tabId: string) {
  const tab = document.querySelector(`[data-agent-element="seo-tab-${tabId}"]`);
  if (!tab) throw new Error(`SEO tab unavailable: ${tabId}`);
  fireEvent.click(tab);
}
