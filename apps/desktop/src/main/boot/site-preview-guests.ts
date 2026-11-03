/** Main-only guest registrations, installed by the owning shell's did-attach-webview callback. */
import { isPublicPreviewUrl, type LivePreviewGuest } from './site-preview.ts';
import type { PreviewTarget } from '../../site-preview-scheduler.ts';

type GuestEvent = 'did-start-navigation' | 'did-finish-load' | 'did-navigate-in-page' | 'destroyed';
interface PreviewGuestContents {
  getURL(): string;
  isDestroyed(): boolean;
  isLoading(): boolean;
  capturePage: LivePreviewGuest['capturePage'];
  on(event: GuestEvent, listener: () => void): unknown;
  removeListener(event: GuestEvent, listener: () => void): unknown;
}

/** Electron identity checks shared by registration and capture revalidation. Matching URL text
 * never substitutes for the host webContents or partition Session identity. O(1).
 */
export function isLivePreviewGuestAllowed({ owner, guest, shellUrl, partitionSession }: {
  owner: { isDestroyed(): boolean; webContents: { getURL(): string } };
  guest: { hostWebContents?: unknown; session: object };
  shellUrl: string;
  partitionSession: object;
}, _options = {}): boolean {
  return !owner.isDestroyed() && owner.webContents.getURL() === shellUrl
    && guest.hostWebContents === owner.webContents && guest.session === partitionSession;
}

/** Bind eligible guests to canonical sites. Ownership and session validation stay at composition.
 * O(1) per event/lookup, O(registered guests) memory; teardown removes all guest listeners. */
export function createLivePreviewGuests<Owner extends { isDestroyed(): boolean }, Guest extends PreviewGuestContents>({ resolve, allowed, schedule, cancel }: {
  resolve: (input: { url: string }) => (PreviewTarget & { siteDir: string }) | undefined;
  allowed: (input: { owner: Owner; guest: Guest; target: PreviewTarget & { siteDir: string } }) => boolean;
  schedule: (input: { siteDir: string }) => void;
  cancel: (input: { siteDir: string }) => void;
}, _options = {}) {
  const live = new Map<string, LivePreviewGuest>();
  return {
    liveGuest({ siteDir }: { siteDir: string }, _options = {}): LivePreviewGuest | undefined {
      const snapshot = live.get(siteDir);
      return snapshot?.isCurrent() ? snapshot : undefined;
    },
    register({ owner, guest }: { owner: Owner; guest: Guest }, _options = {}): () => void {
      let generation = 0;
      let disposed = false;
      let previous: { siteDir: string; snapshot: LivePreviewGuest } | undefined;
      const invalidate = () => {
        generation++;
        if (!previous || live.get(previous.siteDir) !== previous.snapshot) return;
        live.delete(previous.siteDir);
        cancel({ siteDir: previous.siteDir });
      };
      const ready = () => {
        invalidate();
        if (disposed || owner.isDestroyed() || guest.isDestroyed() || guest.isLoading()) return;
        const target = resolve({ url: guest.getURL() });
        if (!target || !allowed({ owner, guest, target })) return;
        const origin = target.scheme === 'https' ? `https://localhost:${target.port}` : `http://127.0.0.1:${target.port}`;
        if (!isPublicPreviewUrl({ url: guest.getURL(), origin })) return;
        const version = generation;
        const snapshot: LivePreviewGuest = {
          partition: target.partition, getURL: () => guest.getURL(), capturePage: () => guest.capturePage(),
          isCurrent: () => {
            if (disposed || generation !== version || live.get(target.siteDir) !== snapshot || owner.isDestroyed() || guest.isDestroyed() || guest.isLoading()) return false;
            const current = resolve({ url: guest.getURL() });
            return current?.siteDir === target.siteDir && current.port === target.port && current.partition === target.partition && allowed({ owner, guest, target: current });
          },
        };
        live.set(target.siteDir, snapshot);
        previous = { siteDir: target.siteDir, snapshot };
        schedule({ siteDir: target.siteDir });
      };
      const off = () => {
        disposed = true;
        invalidate();
        guest.removeListener('did-start-navigation', invalidate);
        guest.removeListener('did-finish-load', ready);
        guest.removeListener('did-navigate-in-page', ready);
        guest.removeListener('destroyed', off);
      };
      guest.on('did-start-navigation', invalidate);
      guest.on('did-finish-load', ready);
      guest.on('did-navigate-in-page', ready);
      guest.on('destroyed', off);
      return off;
    },
  };
}
