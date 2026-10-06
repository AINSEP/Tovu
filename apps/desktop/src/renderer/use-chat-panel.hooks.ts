/**
 * @file The ONE desktop chat's panel state (SPEC-051, owner design 2026-10-06): a full-height right
 * panel opened from the shell's own FAB, DOCKED beside the content at 900px of window width and up,
 * an OVERLAY over it below that. Once opened it stays open — the operator closes it, nothing else
 * does — except that Escape dismisses the overlay, which covers the content it sits over.
 *
 * Also the one place that decides which site a turn is about: the VISIBLE site tab's folder. Main
 * re-resolves it against the tracked list (`desktop-chat-main.ts`), so this is the renderer's report,
 * never the authority.
 *
 * The decisions are plain exports, for the reason `use-site-rename.hooks.ts` gives: this package has
 * no React renderer, so a rule left inside a hook body cannot be tested here
 * (`use-chat-panel.hooks.test.ts`).
 */
import { useCallback, useEffect, useState } from 'react';
import type { SiteRecord } from '../contracts/project.js';

/** Window width (CSS px) at which the panel docks instead of overlaying. Owner's number. */
export const CHAT_PANEL_DOCK_MIN_WIDTH = 900;

export type ChatPanelLayout = 'docked' | 'overlay';

/** Docked at {@link CHAT_PANEL_DOCK_MIN_WIDTH} and up, overlay below. Pure. @complexity O(1). */
export function chatPanelLayout({ width }: { width: number }): ChatPanelLayout {
  return width >= CHAT_PANEL_DOCK_MIN_WIDTH ? 'docked' : 'overlay';
}

/**
 * Whether a keypress closes the panel: only Escape, only while open, only as an overlay. The docked
 * panel ignores it — Escape inside the composer (dismissing a picker, say) must not hide a panel the
 * owner wants always visible once opened. Pure. @complexity O(1).
 */
export function closesOnKey({ key, open, layout }: { key: string; open: boolean; layout: ChatPanelLayout }): boolean {
  return key === 'Escape' && open && layout === 'overlay';
}

/**
 * The visible site tab's folder, or `null` when no site tab is on screen (sites home, Appearance,
 * a tab that just closed). Only the visible one: a background tab is never the turn's site.
 * @complexity O(n) in the open-tab count.
 */
export function activeSiteDirOf({
  visibleWorkspaceId,
  openSites,
}: {
  visibleWorkspaceId: string | null;
  openSites: readonly Pick<SiteRecord, 'id' | 'installDir'>[];
}): string | null {
  if (visibleWorkspaceId === null) return null;
  return openSites.find((site) => site.id === visibleWorkspaceId)?.installDir ?? null;
}

/** `.app`'s `data-chat` value, which `desktop-chat.css` keys every layout rule off. Pure. @complexity O(1). */
export function chatPanelDataAttribute({ open, layout }: { open: boolean; layout: ChatPanelLayout }): 'closed' | ChatPanelLayout {
  return open ? layout : 'closed';
}

/** The slice of `window` the hook listens on; injectable so a caller can hand it a fake. */
type PanelWindow = Pick<Window, 'innerWidth' | 'addEventListener' | 'removeEventListener'>;

export interface ChatPanelState {
  open: boolean;
  layout: ChatPanelLayout;
  /** `.app`'s `data-chat` attribute. */
  dataChat: 'closed' | ChatPanelLayout;
  openPanel: () => void;
  closePanel: () => void;
}

/**
 * The panel's open flag and its layout, which tracks the window width live (a resize across 900px
 * flips docked/overlay without closing it).
 *
 * @param optional `win` — defaults to the real `window`.
 * @complexity O(1) per resize / keydown.
 */
export function useChatPanel(optional: { win?: PanelWindow } = {}): ChatPanelState {
  const win = optional.win ?? window;
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<ChatPanelLayout>(() => chatPanelLayout({ width: win.innerWidth }));

  useEffect(() => {
    const onResize = () => setLayout(chatPanelLayout({ width: win.innerWidth }));
    win.addEventListener('resize', onResize);
    return () => win.removeEventListener('resize', onResize);
  }, [win]);

  useEffect(() => {
    const onKeyDown = (event: Event) => {
      if (closesOnKey({ key: (event as KeyboardEvent).key, open, layout })) setOpen(false);
    };
    win.addEventListener('keydown', onKeyDown);
    return () => win.removeEventListener('keydown', onKeyDown);
  }, [win, open, layout]);

  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);

  return { open, layout, dataChat: chatPanelDataAttribute({ open, layout }), openPanel, closePanel };
}
