import type { ChatPaneWorkingDirectoryAccess } from "@jini-ai/chat/react";

/**
 * @file Native folder picker for the assistant composer's working-directory control.
 *
 * Implements `@jini-ai/chat/react`'s `ChatPaneWorkingDirectoryAccess` contract on top of the File
 * System Access API (`window.showDirectoryPicker`) — supported in Chrome/Edge, not in Safari or
 * Firefox. `AssistantDock` only passes this object as the `workingDirectoryAccess` prop when
 * {@link isDirectoryPickerSupported} is true; on every other browser it omits the prop entirely,
 * which is what keeps `ChatPane`'s existing text-input popover fallback alive there (see
 * `ChatPane.tsx`'s `ChatPaneWorkingDirectoryBlock` — a falsy `workingDirectoryAccess` is the
 * documented switch between the native `WorkingDirPicker` and that fallback).
 *
 * KNOWN LIMITATION, by design: `showDirectoryPicker()` resolves a `FileSystemDirectoryHandle`,
 * and browsers deliberately withhold that handle's real absolute filesystem path — `.name` (the
 * folder's own basename, e.g. `"Tovu"`, never `"/Users/x/Tovu"`) is all a page can read. Every
 * string this module hands back to `ChatPane` is therefore a folder NAME, not a path — see
 * {@link directoryExists}'s own doc for the consequence. This matches `AssistantDock.tsx`'s
 * existing `initialWorkingDirectory="Tovu"` comment: the value stays a display label for the
 * operator, not something round-tripped to the agent daemon's real `cwd`
 * (`agent-daemon-server.ts`) — that round-trip is a separate, not-yet-built change.
 */

declare global {
  interface Window {
    /**
     * File System Access API entry point. Not yet part of TypeScript's bundled DOM lib —
     * `FileSystemDirectoryHandle` itself is declared there, but this picker function is not.
     * Optional because most browsers have no implementation at all; every call site here goes
     * through {@link isDirectoryPickerSupported} first.
     */
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

const RECENT_DIRECTORY_NAMES_STORAGE_KEY = "tovu.assistant.recentWorkingDirectoryNames";

/** Recent-folder list length cap — a handful of names is enough for a "recent" menu to be useful. */
const MAX_RECENT_DIRECTORY_NAMES = 5;

/** True only in a browser that implements the native directory-picker API. */
export function isDirectoryPickerSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/**
 * Reads the persisted recent-folder-name list.
 *
 * @returns The stored names, most-recent-first, or `[]` for a first run, a private-browsing
 * storage denial, or corrupt/foreign JSON under this key — every failure mode degrades to "no
 * recent folders" rather than throwing, since losing this list is cosmetic.
 */
function readRecentDirectoryNames(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_DIRECTORY_NAMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/** Moves `name` to the front of the persisted recent list, deduplicated and capped. */
function recordRecentDirectoryName(name: string): void {
  try {
    const next = [name, ...readRecentDirectoryNames().filter((existing) => existing !== name)].slice(
      0,
      MAX_RECENT_DIRECTORY_NAMES,
    );
    window.localStorage.setItem(RECENT_DIRECTORY_NAMES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Same degrade-silently posture as the read side above.
  }
}

/**
 * Builds the native `ChatPaneWorkingDirectoryAccess` implementation for the assistant composer.
 *
 * @returns The access object, or `undefined` when this browser has no File System Access API.
 * Callers must omit the `workingDirectoryAccess` prop entirely in the `undefined` case rather than
 * passing it through — see this module's header for why that is what preserves the fallback UI.
 * @complexity Time: O(1) per call (the persisted list is capped at
 * {@link MAX_RECENT_DIRECTORY_NAMES}). Space: O(1).
 */
export function createBrowserWorkingDirectoryAccess(): ChatPaneWorkingDirectoryAccess | undefined {
  if (!isDirectoryPickerSupported()) return undefined;

  return {
    /**
     * Opens the OS-native folder chooser (Finder on macOS, Explorer on Windows). Resolves the
     * picked folder's `.name` — never a path, see this module's header — or `null` on cancel.
     *
     * `AbortError` is the API's documented outcome for the user dismissing the dialog (Escape,
     * Cancel button) — a normal result, not a failure — so it resolves `null` here exactly like
     * this contract's own "user cancelled" case, rather than rejecting. Any other rejection (no
     * secure context, permission policy, a disallowing sandboxed iframe) is left to propagate:
     * the calling hook (`useChatPaneWorkingDirectory` in `@jini-ai/chat/react`) already routes a
     * thrown error here into `workingDirectoryError` for the package's own error UI.
     */
    async pickWorkingDirectory(): Promise<string | null> {
      try {
        const handle = await window.showDirectoryPicker!();
        recordRecentDirectoryName(handle.name);
        return handle.name;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return null;
        throw error;
      }
    },

    /** Most-recently-picked folder NAMES, most-recent-first — see this module's header. */
    async recentDirectories(): Promise<readonly string[]> {
      return readRecentDirectoryNames();
    },

    /**
     * Always resolves `true`.
     *
     * A folder NAME (this module's only available signal — see the header) cannot be checked
     * against the real filesystem from a browser tab: the File System Access API has no "does a
     * folder with this name exist" query independent of a live handle, and this module persists
     * only name strings, never handles, across reloads. Reporting `false` here would flag Tovu's
     * own static `initialWorkingDirectory="Tovu"` label — and every restored recent name — as
     * invalid on every load, which is a worse default than this honest "cannot verify" no-op.
     */
    async directoryExists(): Promise<boolean> {
      return true;
    },
  };
}
