/**
 * @file Tovu's bindings for the collaborators the `@jini-ai/admin` shell takes by injection
 * (ex5-fnd-kit review, rv-g FIX 1/3). Jini's shell imports no core implementation and writes no
 * console output; this file is where the admin app chooses them.
 */
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import { browserStreamPorts, type BrowserStreamPorts } from "@jini-ai/admin/shell/lib/browser-stream";
import { onAdminSecretRedacted } from "@jini-ai/admin/shell/lib/credential-card-guidance";

/** The admin app's logger: core's console logger describes caught errors instead of printing them raw. */
export const adminLogger = createConsoleLogger({ prefix: "[admin]" });

/** Browser stream ports with the host's guarded call. A function, not a constant: the ports read
 *  `document`/`window`, which must not happen at module import. */
export function adminBrowserStreamPorts(_required = {}, _optional = {}): BrowserStreamPorts {
  return browserStreamPorts({ orFallbackSync });
}

/** Tovu wraps each MCP-UI card in its overflow-aware surface (`OverflowAwareMcpUiSurfaceCard`); the
 *  credential guide scrolls that wrapper, not the bare card, into view. */
export const MCP_UI_CARD_WRAPPER_SELECTOR = ".mcpui-surface-overflow-wrap";

/** The redaction callback the chat posters take, bound to Tovu's card markup. */
export function onTovuSecretRedacted(signal: Parameters<typeof onAdminSecretRedacted>[0]): void {
  onAdminSecretRedacted(signal, { cardWrapperSelector: MCP_UI_CARD_WRAPPER_SELECTOR });
}

/** Tovu's sidebar markup for the shell's label-tooltip hook: its item links, and Sites, which owns a
 *  measured name-only tooltip (the one host exception). */
export const SIDEBAR_TOOLTIP_ITEMS = { itemSelector: "a.cms-item" } as const;
export const sidebarOwnsTitle = ({ link }: { link: Element }): boolean => link.getAttribute("href")?.endsWith("/sites") ?? false;
