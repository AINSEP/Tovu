import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@/__tests__/fetch-query-render';
import { MediaContentEditor } from '../WidgetConfigFields/MediaContentEditor';
import { useWidgetPreview } from '../WidgetConfigFields/WidgetPreview.hooks';
import type { HtmlPreviewPort } from '@jini-ai/ui/admin-widgets';
import type { MediaPickerPort } from '../MediaPickerDialog/media-picker-port.hooks';
import { SHARED_COMPONENTS_DICT } from '../shared-components-i18n';
import { renderWidgetPreviewDocument } from '../WidgetConfigFields/widget-config-fields-dependencies.hooks';
import type { authenticatedAdminRequest } from '../../lib/api';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const library: MediaPickerPort = { listMedia: async () => ({ media: [] }), mediaOriginalUrl: () => '' };

it('uses the authenticated widget endpoint with the exact content and abort signal', async () => {
  const calls: unknown[] = [];
  const signal = new AbortController().signal;
  const request: typeof authenticatedAdminRequest = async <T,>(input: Parameters<typeof authenticatedAdminRequest>[0], options?: Parameters<typeof authenticatedAdminRequest>[1]) => {
    calls.push({ input, signal: options?.signal });
    return { html: '<b>unsaved</b>', document: '<html>themed</html>' } as T;
  };
  const output = await renderWidgetPreviewDocument({ source: '{"widgetType":"media","content":{"mode":"html","html":"<b>unsaved</b>"}}' }, { signal, request });
  expect(output).toBe('<html>themed</html>');
  expect(calls).toEqual([{ input: { path: '/workspaces/workspace-local/widgets/preview', method: 'POST', body: { widgetType: 'media', content: { mode: 'html', html: '<b>unsaved</b>' } } }, signal }]);
});

it('forwards complete replacement configs after 400ms and ignores a stale server response', async () => {
  const calls: Array<{ source: string; signal: AbortSignal; resolve: (document: string) => void }> = [];
  const port: HtmlPreviewPort = ({ source }, { signal }) => new Promise(resolve => calls.push({ source, signal, resolve }));
  const h = renderHook(({ config }) => useWidgetPreview({ widgetType: 'media', config }, { render: port }), {
    initialProps: { config: { mode: 'media', items: [{ slug: 'photo' }] } as Record<string, unknown> },
  });
  await act(() => vi.advanceTimersByTimeAsync(399));
  expect(calls).toEqual([]);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(calls[0].source).toBe('{"widgetType":"media","content":{"mode":"media","items":[{"slug":"photo"}]}}');
  h.rerender({ config: { mode: 'html', html: '<img src="{{media:photo}}">' } });
  expect(calls[0].signal.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(400));
  expect(calls[1].source).toBe(String.raw`{"widgetType":"media","content":{"mode":"html","html":"<img src=\"{{media:photo}}\">"}}`);
  await act(async () => calls[1].resolve('<html><body>latest</body></html>'));
  await act(async () => calls[0].resolve('<html><body>stale</body></html>'));
  expect(h.result.current.document).toBe('<html><body>latest</body></html>');
  expect(h.result.current.error).toBe(null);
});

it('renders the shared frame with an empty sandbox and short loading/error lines', async () => {
  let reject: (reason: Error) => void = () => {};
  const port: HtmlPreviewPort = () => new Promise((_resolve, fail) => { reject = fail; });
  render(<MediaContentEditor widgetType="media" config={{ mode: 'html', html: '<b>Draft</b>' }} onChange={() => {}} port={library}
    usePreview={(input) => useWidgetPreview(input, { render: port })} />);
  const frame = screen.getByTitle('Preview');
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('srcdoc')).toBe('');
  expect(frame.closest('.page-preview-frame')).not.toBe(null);
  expect(screen.getByText('Loading preview…').textContent).toBe('Loading preview…');
  await act(() => vi.advanceTimersByTimeAsync(400));
  await act(async () => reject(new Error('private detail')));
  expect(screen.getByText('Preview unavailable.').textContent).toBe('Preview unavailable.');
});

it('displays the server document verbatim in the sandboxed frame', async () => {
  const document = '<html><head><link rel="stylesheet" href="/theme-assets/active/css/theme.css"></head><body><img src="/m/photo/public.v1/image.jpg"></body></html>';
  const port: HtmlPreviewPort = async () => document;
  render(<MediaContentEditor widgetType="media" config={{ mode: 'html', html: '<img src="{{media:photo}}">' }} onChange={() => {}} port={library}
    usePreview={(input) => useWidgetPreview(input, { render: port })} />);
  await act(() => vi.advanceTimersByTimeAsync(400));
  expect(screen.getByTitle('Preview').getAttribute('srcdoc')).toBe(document);
});

it('translates the three preview strings in every shared-components locale', () => {
  expect(SHARED_COMPONENTS_DICT.es.Preview).toBe('Vista previa');
  expect(SHARED_COMPONENTS_DICT.es['Loading preview…']).toBe('Cargando vista previa…');
  expect(SHARED_COMPONENTS_DICT.es['Preview unavailable.']).toBe('Vista previa no disponible.');
  for (const dictionary of Object.values(SHARED_COMPONENTS_DICT)) {
    for (const key of ['Preview', 'Loading preview…', 'Preview unavailable.']) {
      expect(typeof dictionary[key]).toBe('string');
      expect(dictionary[key]).not.toBe(key);
    }
  }
});
