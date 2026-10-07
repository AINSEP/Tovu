/** Tovu theme feed adapter. Transport and lifecycle ports keep the desktop shell replaceable.
 * NEEDS-JINI: reusable watched-stream ownership belongs in @jini-ai/desktop-host (read-only dispatch). */
import { EventSource } from 'eventsource';
import type { SiteThemePreviewRefresh } from './contracts/project.ts';

export interface ThemePreviewFrame { revision: string; path?: string }
export interface SiteThemePreviewTarget {
  port: number;
  workspaceId: string;
  partition: string;
  /** The actual supervised server handle, so even a restart reusing a port is a new lifecycle. */
  lifecycle: object;
}
interface StreamSource {
  addEventListener: (name: string, listener: (event: { data: string }) => void) => void;
  close: () => void;
}
type StreamFetch = NonNullable<ConstructorParameters<typeof EventSource>[1]>['fetch'];

export function openSiteThemePreviewStream(
  { target, getRevision, onFrame, fetch }: {
    target: SiteThemePreviewTarget;
    getRevision: () => string | undefined;
    onFrame: (frame: ThemePreviewFrame) => void;
    fetch: NonNullable<StreamFetch>;
  },
  { open = (url, options) => new EventSource(url, options) }: {
    open?: (url: string, options: { fetch: NonNullable<StreamFetch> }) => StreamSource;
  } = {},
): () => void {
  const url = `http://127.0.0.1:${target.port}/api/admin/v1/workspaces/${encodeURIComponent(target.workspaceId)}/settings/events?themePreview=1`;
  let closed = false;
  const source = open(url, { fetch: (_url, init) => {
    // Every retry uses the same site's cookie jar and the last revision it actually delivered.
    const next = new URL(url);
    const revision = getRevision();
    if (revision) next.searchParams.set('themeRevision', revision);
    return fetch(next.href, init);
  } });
  source.addEventListener('theme-preview-refresh', (event) => {
    if (closed) return;
    try {
      const frame: unknown = JSON.parse(event.data);
      if (!frame || typeof frame !== 'object' || !('revision' in frame) || typeof frame.revision !== 'string' || !/^[\w-]{1,100}$/.test(frame.revision)) return;
      if ('path' in frame && typeof frame.path !== 'string') return;
      onFrame({ revision: frame.revision, ...('path' in frame ? { path: frame.path as string } : {}) });
    } catch { /* A bad frame must never break independent settings notifications or the host window. */ }
  });
  return () => { closed = true; source.close(); };
}

export interface SiteThemePreviewPorts {
  current: (required: { siteDir: string }, optional: {}) => SiteThemePreviewTarget | undefined;
  open: (required: { siteDir: string; target: SiteThemePreviewTarget; getRevision: () => string | undefined; onFrame: (frame: ThemePreviewFrame) => void }, optional: {}) => () => void;
}

export function createSiteThemePreviewSubscriptions(
  { ports }: { ports: SiteThemePreviewPorts }, _optional = {},
) {
  const watchers = new Map<string, Set<(frame: SiteThemePreviewRefresh) => void>>();
  const streams = new Map<string, { target: SiteThemePreviewTarget; close?: () => void; revision?: string }>();
  const stop = ({ siteDir }: { siteDir: string }, _optional = {}) => {
    const stream = streams.get(siteDir);
    // Remove ownership before closing: late callbacks cannot affect the replacement lifecycle.
    streams.delete(siteDir);
    try { stream?.close?.(); } catch { /* Best-effort teardown cannot block stopping a site. */ }
  };
  const sync = ({ siteDir }: { siteDir: string }, _optional = {}) => {
    const target = ports.current({ siteDir }, {});
    if (!target || !watchers.get(siteDir)?.size) { stop({ siteDir }); return; }
    if (streams.get(siteDir)?.target.lifecycle === target.lifecycle) return;
    stop({ siteDir });
    const stream: { target: SiteThemePreviewTarget; close?: () => void; revision?: string } = { target };
    streams.set(siteDir, stream);
    try {
      stream.close = ports.open({ siteDir, target, getRevision: () => stream.revision, onFrame: (frame) => {
        if (streams.get(siteDir) !== stream || ports.current({ siteDir }, {})?.lifecycle !== target.lifecycle || stream.revision === frame.revision) return;
        stream.revision = frame.revision;
        for (const listener of watchers.get(siteDir) ?? []) {
          try { listener({ siteDir, ...frame }); } catch { /* A destroyed renderer cannot stop other tabs' notifications. */ }
        }
      } }, {});
    } catch { streams.delete(siteDir); }
  };
  return {
    sync, stop,
    watch({ siteDir, listener }: { siteDir: string; listener: (frame: SiteThemePreviewRefresh) => void }, _optional = {}) {
      const listeners = watchers.get(siteDir) ?? new Set();
      watchers.set(siteDir, listeners); listeners.add(listener); sync({ siteDir });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) { watchers.delete(siteDir); stop({ siteDir }); }
      };
    },
    dispose(_required = {}, _optional = {}) {
      for (const siteDir of streams.keys()) stop({ siteDir });
      watchers.clear();
    },
  };
}
