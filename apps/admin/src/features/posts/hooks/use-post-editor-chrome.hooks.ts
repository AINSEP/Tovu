import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { api, type AdminPost } from "@/lib/api";
import { navigate } from "@/lib/router";
import { siteUrl } from "@/lib/site-url";

/**
 * @file The Edit post screen's chrome (2026-10-09 redesign, owner: "looks horrid") — the sticky top
 * bar's menus, the Post settings panel, the ⌘S shortcut, the brief "Saved" state, Copy link and
 * Duplicate. Kept out of `usePostEditor` and its `PostEditorPort` on purpose: none of this touches
 * the post's own load/save/autosave state machine, so that port and its fakes stay untouched and this
 * gets its own small port instead.
 *
 * Menus are identified by a string id and found in the DOM through `data-post-menu="<id>"` on the
 * wrapper that holds both the trigger and its popover, so an outside pointerdown can be detected
 * without threading a ref per menu through the markup.
 */

/** The popovers this screen opens; at most one is open at a time. */
export type PostEditorMenuId = "text" | "insert" | "more-format" | "actions";

/** Everything outside React this hook reaches — injectable so the hook test runs without a server. */
export interface PostEditorChromePort {
  createPost(title: string): Promise<{ post: AdminPost }>;
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "bodyJson" | "templateChoice" | "author" | "showAuthor" | "featuredMediaId">> & {
      expectedVersion?: number;
    },
  ): Promise<{ post: AdminPost }>;
  navigate(path: string): void;
  copyText(text: string): Promise<void>;
  siteUrl(path: string): string;
  readSetting(key: string): string | null;
  writeSetting(key: string, value: string): void;
  /** Whether the viewport is wide enough for the settings panel to sit beside the editor. */
  isWide(): boolean;
}

export const defaultPostEditorChromePort: PostEditorChromePort = {
  createPost: (title) => api.createPost(title),
  updatePost: (target, patch) => api.updatePost(target, patch),
  navigate: (path) => navigate(path),
  copyText: (text) => navigator.clipboard.writeText(text),
  siteUrl: (path) => siteUrl(path),
  // Storage can throw outright (privacy modes, blocked site data); the panel then just uses its default.
  readSetting: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  writeSetting: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* not remembered — harmless */
    }
  },
  isWide: () => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1280px)").matches,
};

export interface PostEditorChromeInput {
  post: AdminPost | null;
  title: string;
  setTitle: (value: string) => void;
  bodyJson: unknown;
  templateChoice: string | null;
  author: string;
  showAuthor: boolean;
  featuredMediaId: string | null;
  dirty: boolean;
  saving: boolean;
  message: string | null;
  error: string | null;
  onSave: () => void;
  confirmLeave: () => boolean;
  t: Translate;
}

export interface PostEditorChromeController {
  openMenu: PostEditorMenuId | null;
  toggleMenu: (id: PostEditorMenuId) => void;
  closeMenu: () => void;
  /** Wraps a menu item's action so the menu closes once it runs. */
  closeMenuAfter: (action: () => void) => () => void;
  settingsOpen: boolean;
  toggleSettings: () => void;
  closeSettings: () => void;
  /** True for a couple of seconds after a save succeeds — the Save button shows "Saved". */
  savedFlash: boolean;
  liveUrl: string;
  linkCopied: boolean;
  copyLink: () => void;
  canDuplicate: boolean;
  duplicating: boolean;
  duplicate: () => void;
  chromeError: string | null;
  dismissChromeError: () => void;
  titleRef: RefObject<HTMLTextAreaElement | null>;
  focusTitle: () => void;
  /** The title textarea's change handler — keeps the title on one line. */
  onTitleChange: (value: string) => void;
  /** Enter in the title does not add a line break. */
  onTitleKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}

export const POST_SETTINGS_OPEN_KEY = "tovu.postEditor.settingsOpen";
const SAVED_FLASH_MS = 2400;
const LINK_COPIED_MS = 2000;

/** True when a keyboard event is the save chord: ⌘S on macOS, Ctrl+S elsewhere, no other modifiers. */
export function isSaveChord(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s";
}

/** The title is one line: a textarea only so long titles wrap instead of being cut off. */
export function singleLineTitle(value: string): string {
  return value.replace(/\r?\n/g, " ");
}

/** A menu stays open for a pointerdown inside its own wrapper, or inside a modal one of its items opened. */
function isInsideMenu(target: EventTarget | null, id: PostEditorMenuId): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(`[data-post-menu="${id}"]`) !== null || target.closest("dialog[open]") !== null;
}

function usePostEditorMenus(): Pick<PostEditorChromeController, "openMenu" | "toggleMenu" | "closeMenu" | "closeMenuAfter"> {
  const [openMenu, setOpenMenu] = useState<PostEditorMenuId | null>(null);
  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const toggleMenu = useCallback((id: PostEditorMenuId) => setOpenMenu((current) => (current === id ? null : id)), []);
  const closeMenuAfter = useCallback((action: () => void) => () => {
    setOpenMenu(null);
    action();
  }, []);

  useEffect(() => {
    if (openMenu === null) return;
    function onPointerDown(event: PointerEvent) {
      if (!isInsideMenu(event.target, openMenu!)) setOpenMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      // Escape inside a dialog an item opened closes that dialog only.
      if (event.key !== "Escape" || (event.target instanceof Element && event.target.closest("dialog[open]"))) return;
      setOpenMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  return { openMenu, toggleMenu, closeMenu, closeMenuAfter };
}

function usePostSettingsPanel(port: PostEditorChromePort): Pick<PostEditorChromeController, "settingsOpen" | "toggleSettings" | "closeSettings"> {
  // Remembered once chosen; until then open beside a wide editor and closed over a narrow one.
  const [settingsOpen, setSettingsOpen] = useState(() => {
    const stored = port.readSetting(POST_SETTINGS_OPEN_KEY);
    return stored === null ? port.isWide() : stored === "1";
  });
  const setAndRemember = useCallback((open: boolean) => {
    setSettingsOpen(open);
    port.writeSetting(POST_SETTINGS_OPEN_KEY, open ? "1" : "0");
  }, [port]);
  return {
    settingsOpen,
    toggleSettings: () => setAndRemember(!settingsOpen),
    closeSettings: () => setAndRemember(false),
  };
}

/** Flips true when `trigger` becomes truthy and back to false after `ms`. */
function useFlash(trigger: unknown, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!trigger) return;
    setOn(true);
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [trigger, ms]);
  return on;
}

function useSaveShortcut({ dirty, saving, onSave }: Pick<PostEditorChromeInput, "dirty" | "saving" | "onSave">): void {
  // Same idiom as `use-theme-explore.hooks.ts`: the browser's own "Save page" is always swallowed on
  // this screen; only the save itself is conditional.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isSaveChord(event)) return;
      event.preventDefault();
      if (dirty && !saving) onSave();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, saving, onSave]);
}

/**
 * Duplicate: there is no duplicate endpoint and `createPost(title)` only makes posts, so this creates
 * a post, copies the editable fields onto it in one update, and opens the copy. Leaving runs the same
 * unsaved-work guard as the back link. Posts only — a page copy would come back as a post.
 */
function useDuplicatePost(input: PostEditorChromeInput, port: PostEditorChromePort, onError: (message: string) => void) {
  const [duplicating, setDuplicating] = useState(false);
  const { post, title, bodyJson, templateChoice, author, showAuthor, featuredMediaId, confirmLeave, t } = input;
  const canDuplicate = post !== null && post.kind !== "page";
  const duplicate = useCallback(() => {
    if (!post || post.kind === "page" || duplicating || !confirmLeave()) return;
    setDuplicating(true);
    void (async () => {
      try {
        const { post: created } = await port.createPost(t("{title} (copy)").replace("{title}", title || post.title));
        await port.updatePost({ id: created.id }, {
          ...(bodyJson ? { bodyJson: bodyJson as AdminPost["bodyJson"] } : {}),
          templateChoice,
          author,
          showAuthor,
          featuredMediaId,
          expectedVersion: created.version,
        });
        port.navigate(`/posts/${created.slug}`);
      } catch {
        onError(t("Could not duplicate this post"));
      } finally {
        setDuplicating(false);
      }
    })();
  }, [post, title, bodyJson, templateChoice, author, showAuthor, featuredMediaId, confirmLeave, t, port, duplicating, onError]);
  return { canDuplicate, duplicating, duplicate };
}

export function usePostEditorChrome(
  input: PostEditorChromeInput,
  port: PostEditorChromePort = defaultPostEditorChromePort,
): PostEditorChromeController {
  const { post, message, error, setTitle, t } = input;
  const menus = usePostEditorMenus();
  const settings = usePostSettingsPanel(port);
  useSaveShortcut(input);
  const savedFlash = useFlash(message && !error ? message : null, SAVED_FLASH_MS);

  const [chromeError, setChromeError] = useState<string | null>(null);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const linkCopied = useFlash(copiedAt, LINK_COPIED_MS);
  const liveUrl = port.siteUrl(`/${post?.slug ?? ""}`);
  const copyLink = useCallback(() => {
    port.copyText(liveUrl).then(
      () => setCopiedAt(Date.now()),
      () => setChromeError(t("Could not copy the link")),
    );
  }, [port, liveUrl, t]);
  const { canDuplicate, duplicating, duplicate } = useDuplicatePost(input, port, setChromeError);

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const focusTitle = useCallback(() => {
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView?.({ block: "center" });
  }, []);

  return {
    ...menus,
    ...settings,
    savedFlash,
    liveUrl,
    linkCopied,
    copyLink,
    canDuplicate,
    duplicating,
    duplicate,
    chromeError,
    dismissChromeError: () => setChromeError(null),
    titleRef,
    focusTitle,
    onTitleChange: (value) => setTitle(singleLineTitle(value)),
    onTitleKeyDown: (event) => {
      if (event.key === "Enter") event.preventDefault();
    },
  };
}
