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
  type Owner = { claims: Map<string, () => void>; destroy: () => void };
  const owners = new Map<PreviewSender, Owner>();
  // Every caller already holds the sender's live owner, and each path removes it (and its destroy
  // hook) before anything else, so an owner is released at most once.
  const release = (sender: PreviewSender, owner: Owner) => {
    owners.delete(sender);
    sender.removeListener('destroyed', owner.destroy);
    for (const off of owner.claims.values()) off();
  };
  const inputId = (input: unknown) => {
    if (!input || typeof input !== 'object' || !('subscriptionId' in input)) return undefined;
    const { subscriptionId } = input;
    return typeof subscriptionId === 'string' && /^[\w-]{1,100}$/.test(subscriptionId) ? subscriptionId : undefined;
  };
  ipcMain.handle(channels.watch, ({ sender }, input) => {
    const id = inputId(input);
    if (!allowed(sender) || sender.isDestroyed() || !id) return;
    const siteDir = watchSiteDirectory({ input });
    if (siteDir === undefined) return;
    let owner = owners.get(sender);
    if (!owner) {
      const created: Owner = { claims: new Map(), destroy: () => release(sender, created) };
      owner = created;
      owners.set(sender, owner); sender.once('destroyed', owner.destroy);
    }
    if (owner.claims.has(id)) return;
    owner.claims.set(id, subscriptions.watch({ siteDir, listener: (frame) => {
      if (!sender.isDestroyed()) sender.send(channels.event, frame);
    } }));
  });
  ipcMain.handle(channels.unwatch, ({ sender }, input) => {
    const id = inputId(input);
    if (!id) return;
    const owner = owners.get(sender);
    owner?.claims.get(id)?.(); owner?.claims.delete(id);
    if (owner?.claims.size === 0) release(sender, owner);
  });
  return () => {
    for (const [sender, owner] of owners) release(sender, owner);
    ipcMain.removeHandler(channels.watch); ipcMain.removeHandler(channels.unwatch);
  };
}

/** Read only a string directory from a watch claim; leave sender trust checks at the boundary.
 * @complexity O(1) time and space.
 */
function watchSiteDirectory({ input }: { input: unknown }, _options = {}): string | undefined {
  if (!input || typeof input !== 'object' || !('siteDir' in input) || typeof input.siteDir !== 'string') return undefined;
  return input.siteDir;
}
