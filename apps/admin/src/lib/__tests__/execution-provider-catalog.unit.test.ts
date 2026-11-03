import { expect, it, vi } from 'vitest';

vi.mock('@jini-ai/integrations/media-providers/catalog', async importOriginal => {
  const catalog = await importOriginal<typeof import('@jini-ai/integrations/media-providers/catalog')>();
  return { ...catalog, VENDOR_API_BASE_URLS: { ...catalog.VENDOR_API_BASE_URLS, anthropic: 'https://catalog.example.test' } };
});

import { DEFAULT_EXECUTION_CONFIG } from '../execution-settings';

it('the execution form uses the provider catalog endpoint when its default changes', () => {
  expect(DEFAULT_EXECUTION_CONFIG.byok.baseUrl).toBe('https://catalog.example.test');
});
