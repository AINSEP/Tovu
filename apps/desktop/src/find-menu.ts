/**
 * @file The sites-home window's Find menu item: Cmd+F opens the find bar the renderer owns
 * (`renderer/use-find-in-page.hooks.ts`).
 *
 * Same reason `site-history-menu.ts` exists for Back/Forward: a menu accelerator is the one key
 * binding that still fires while focus is inside a project tab's `<webview>` guest, which a key
 * listener in the sites-home page never sees (`renderer/App.hooks.ts`'s `useExpandedMode` documents
 * the identical gap for Escape). Everything AFTER the bar opens — typing, Enter, Shift+Enter,
 * Escape — is an ordinary DOM keydown on the bar's own input, which lives in THIS document, so only
 * the one "open the bar" step needs main's help at all.
 *
 * The channel literal is inlined rather than imported from `contracts/find-in-page.ts`, for the
 * reason `runner-ipc-stubs.ts` gives. `find-menu.test.ts` fails if it drifts from the contract.
 *
 * No `electron` import, so it can be tested under plain `node --test`.
 */
// Guest-focus accelerator rationale: Jini/packages/desktop-host/src/electron/usability/find-menu.ts.
import { findMenu as buildFindMenu, sendFindToggle as sendToggle } from "@jini-ai/desktop-host/electron/usability";
/** Mirrors the renderer contract; keep the main-only adapter out of preload imports. */
export const FIND_TOGGLE_CHANNEL = "runner:find:toggle";
export interface FindCommandWindow {
  isDestroyed(): boolean;
  webContents?: { send(channel: string): void };
}
export interface FindMenuItem {
  label: string;
  accelerator: string;
  click: (item: unknown, window: FindCommandWindow | undefined) => void;
}
export interface FindMenu { label: string; submenu: [FindMenuItem] }
/** Translate a native focused window to the package send port. @complexity O(1). */
function windowPort({ window }: { window: FindCommandWindow | undefined }) {
  if (!window) return undefined;
  const contents = window.webContents;
  return {
    isDestroyed: () => window.isDestroyed(),
    ...(contents ? { webContents: { send: ({ channel }: { channel: string }) => contents.send(channel) } } : {}),
  };
}
/** Send Tovu's find toggle to the focused window. @complexity O(1). */
export function sendFindToggle({ window }: { window: FindCommandWindow | undefined }): boolean {
  return sendToggle({ window: windowPort({ window }), channel: FIND_TOGGLE_CHANNEL });
}
/** Build native menu callbacks with Tovu wording. @complexity O(1). */
export function findMenu(_requiredArgs: Record<string, never>): FindMenu {
  const menu = buildFindMenu({ channel: FIND_TOGGLE_CHANNEL, labels: { menu: "Find", item: "Find in Page…" } });
  const item = menu.submenu[0];
  return { ...menu, submenu: [{ ...item, click: (_item, window) => item.click({ window: windowPort({ window }) }) }] };
}
