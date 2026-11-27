import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApiError } from '@jini-ai/core/admin-runtime';
import { WORKSPACE_ID } from '@jini-ai/admin/shell/lib/admin-http/config';
import { defaultContentAnalysisPort as contentAnalysisPort } from '../hooks/content-analysis-dependencies.hooks';

/**
 * @file The host's live `ContentAnalysisPort` (`defaultContentAnalysisPort`, bound by `useWiredContentAnalysis`): the
 * workspace-scoped preview routes, and the host `ApiError` -> `AdminApiError` translation the Jini
 * card's rules depend on.
 */

const PREVIEW_URL = `/api/admin/v1/workspaces/${WORKSPACE_ID}/plugins/content-analyzer/preview`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('contentAnalysisPort', () => {
  it("GETs the plugin's preview status (not the admin plugin list) and POSTs the draft to the workspace-scoped /plugins/content-analyzer/preview route", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/plugins/content-analyzer/preview') && method === 'GET') return jsonResponse({ pluginId: 'content-analyzer', enabled: true });
      if (url.endsWith('/plugins/content-analyzer/preview')) return jsonResponse({ pluginId: 'content-analyzer', fields: { report: '{}' } });
      return jsonResponse({ error: 'unexpected' }, 500);
    });
    const body = { postId: 'p1', title: 'Draft title', bodyJson: { type: 'doc' } };

    await expect(contentAnalysisPort.previewStatus({ pluginId: 'content-analyzer' })).resolves.toEqual({ pluginId: 'content-analyzer', enabled: true });
    await expect(contentAnalysisPort.previewPlugin({ target: { pluginId: 'content-analyzer' }, body })).resolves.toEqual({ pluginId: 'content-analyzer', fields: { report: '{}' } });

    // The admin plugin list needs admin.plugins.read, which a built-in editor lacks.
    expect(requests.some(request => request.url.endsWith('/plugins'))).toBe(false);
    expect(requests.map(({ url, method }) => [url, method])).toEqual([[PREVIEW_URL, 'GET'], [PREVIEW_URL, 'POST']]);
    expect(requests[1]!.body).toEqual(body);
  });

  it.each([
    ['previewStatus', () => contentAnalysisPort.previewStatus({ pluginId: 'content-analyzer' }), 404, 'PLUGIN_NOT_FOUND'],
    ['previewPlugin', () => contentAnalysisPort.previewPlugin({ target: { pluginId: 'content-analyzer' }, body: { title: 't', bodyJson: {} } }), 422, 'PLUGIN_HOOK_FAILED'],
  ] as const)('%s rejects with the Jini AdminApiError, keeping status, code and body', async (_name, call, status, code) => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: { code, message: 'plugin refused' } }, status));
    const error = await call().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ status, code, message: 'plugin refused' });
  });
});

it("preserves the browser's request cancellation instead of translating it into a plugin failure", async () => {
  const cancelled = new DOMException("Preview was cancelled", "AbortError");
  const fetchPreview = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== PREVIEW_URL || init?.method !== "GET") {
      return jsonResponse({ error: "Wrong preview request" }, 404);
    }
    throw cancelled;
  });
  vi.stubGlobal("fetch", fetchPreview);
  await expect(contentAnalysisPort.previewStatus({ pluginId: "content-analyzer" })).rejects.toBe(cancelled);
  expect(fetchPreview).toHaveBeenCalledTimes(1);
});
