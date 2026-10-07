/** One sender owns its own claims. Closing a tab or destroying its window releases the stream. */
import { SITE_THEME_PREVIEW_CHANNELS as channels, type SiteThemePreviewRefresh } from './contracts/project.ts';
import type { createSiteThemePreviewSubscriptions } from './site-theme-preview.ts';
interface PreviewSender {
  id: number;
  once: (name: 'destroyed', listener: () => void) => unknown;
  removeListener: (name: 'destroyed', listener: () => void) => unknown;
  isDestroyed: () => boolean;
  send: (channel: string, frame: SiteThemePreviewRefresh) => void;
}

export function registerSiteThemePreviewIpc(
  { ipcMain, subscriptions, allowed }: {
    ipcMain: {
      handle: (channel: string, listener: (event: { sender: PreviewSender }, input: unknown) => void) => void;
      removeHandler: (channel: string) => void;
    };
    subscriptions: Pick<ReturnType<typeof createSiteThemePreviewSubscriptions>, 'watch'>;
    allowed: (sender: PreviewSender) => boolean;
  }, _optional = {},
): () => void {
  const owners = new Map<PreviewSender, { claims: Map<string, () => void>; destroy: () => void }>();
  const release = (sender: PreviewSender) => {
    const owner = owners.get(sender);
    if (!owner) return;
    owners.delete(sender);
    sender.removeListener('destroyed', owner.destroy);
    for (const off of owner.claims.values()) off();
  };
  const inputId = (input: unknown) => input && typeof input === 'object' && 'subscriptionId' in input && typeof input.subscriptionId === 'string' && /^[\w-]{1,100}$/.test(input.subscriptionId) ? input.subscriptionId : undefined;
  ipcMain.handle(channels.watch, ({ sender }, input) => {
    const id = inputId(input);
    if (!allowed(sender) || sender.isDestroyed() || !id || !input || typeof input !== 'object' || !('siteDir' in input) || typeof input.siteDir !== 'string') return;
    let owner = owners.get(sender);
    if (!owner) {
      owner = { claims: new Map(), destroy: () => release(sender) };
      owners.set(sender, owner); sender.once('destroyed', owner.destroy);
    }
    if (owner.claims.has(id)) return;
    owner.claims.set(id, subscriptions.watch({ siteDir: input.siteDir, listener: (frame) => {
      if (!sender.isDestroyed()) sender.send(channels.event, frame);
    } }));
  });
  ipcMain.handle(channels.unwatch, ({ sender }, input) => {
    const id = inputId(input);
    if (!id) return;
    const owner = owners.get(sender);
    owner?.claims.get(id)?.(); owner?.claims.delete(id);
    if (owner?.claims.size === 0) release(sender);
  });
  return () => {
    for (const sender of owners.keys()) release(sender);
    ipcMain.removeHandler(channels.watch); ipcMain.removeHandler(channels.unwatch);
  };
}
