import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/admin-http/request';
import { consentErrors, defaultConsentRevisionsPort } from '@/integrations/jini-admin/consent-ports';

/** @file The host half of the Cookie Consent page: the error reader over this admin's `ApiError`
 * and the default port over its authenticated API. */

describe('consentErrors.isConflict', () => {
  it('is true only for an HTTP 409', () => {
    expect(consentErrors.isConflict({ error: new ApiError({ message: 'x', status: 409 }) })).toBe(true);
    expect(consentErrors.isConflict({ error: new ApiError({ message: 'x', status: 400 }) })).toBe(false);
    expect(consentErrors.isConflict({ error: new Error('409') })).toBe(false);
  });
});

describe('consentErrors.describe', () => {
  it("shows the server's message, else the page's fallback", () => {
    expect(consentErrors.describe({ error: new ApiError({ message: 'Disk full.', status: 500 }), fallback: "Couldn't save." })).toBe('Disk full.');
    expect(consentErrors.describe({ error: new ApiError({ message: '', status: 503 }), fallback: "Couldn't save." })).toBe("Couldn't save.");
  });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('defaultConsentRevisionsPort', () => {
  it('wires the default port to the authenticated admin API under this workspace', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ draft: null }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(defaultConsentRevisionsPort.get()).resolves.toEqual({ draft: null });
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toMatch(/\/workspaces\/[^/]+\/consent\/settings$/);
  });
});
