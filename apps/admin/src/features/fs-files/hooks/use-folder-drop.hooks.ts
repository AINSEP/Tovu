import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ChatPaneComposerHandle } from "@jini-ai/chat/react";

import { api, ApiError } from "../../../lib/api";
import { folderPathsFromDataTransfer } from "../folder-drop";
import { getFolderDropPort, type FolderDropPort } from "../folder-drop-port";

/**
 * @file SPEC-053: wires a dropped folder in the admin chat composer (`AssistantDock`) to (a) the
 * composer's existing text-insertion seam and (b) the `fs-files` `custom` root, so the very next
 * `fs_list_files(root:"custom")` call resolves to the dropped folder with no separate manual step
 * (REQ-02). Mirrors `use-composer-voice-input.hooks.ts`'s "component logic belongs in hooks" split:
 * `AssistantDock.tsx` only renders whatever this returns.
 *
 * **Text insertion always happens; the custom-root set is best-effort on top of it** (`ui.spec.md`
 * §4: "a failed custom-root set must never roll back or block the path text already inserted").
 * `handleDropCapture` inserts the path synchronously before the (async) custom-root call even starts,
 * so REQ-01's already-shipped behavior (folder drop -> path, not attachments) can never regress
 * because of anything this hook's network call does.
 *
 * **Multiple folders in one drop event.** `feature.spec.md`/`behavior.spec.md` only ever describe
 * SEQUENTIAL drops for the "last write wins" custom-root rule (§1.2) — dropping two folders at once
 * in a single `DragEvent` is not named. Composer text mirrors the desktop original
 * (`apps/desktop/src/renderer/folder-drop.ts`'s `onDropCapture`): every recovered folder path, space-
 * joined, in drop order. For the SINGLE `custom` root value (INV-02: at most one at a time), this
 * applies the same "most recent wins" rule one level down and uses the LAST folder in that same drop
 * — a judgment call, not a spec requirement, made because no other rule in the approved spec package
 * covers this case and "last" is the only choice consistent with §1.2's own tie-break for the
 * sequential case.
 *
 * **Reading the previous root before overwriting it** (`applyCustomRoot`'s `getCustomRoot()` call)
 * is purely cosmetic — it only feeds `FolderDropConfirmation`'s `replacedPreviousPath` wording
 * (`ui.spec.md` §2.1). Its failure is swallowed on purpose: REQ-02's actual set call is unaffected
 * either way, so a flaky read never blocks the feature this hook exists to deliver.
 */

/** Mirrors `errors.spec.md`'s `FolderDropError.reason` enum exactly. */
export type FolderDropErrorReason = "not-a-directory" | "does-not-exist" | "endpoint-unreachable";

/** One of `ui.spec.md`'s two notice shapes — never both at once (`useState` holds at most one). */
export type FolderDropNotice =
  | { readonly kind: "confirmation"; readonly path: string; readonly replacedPreviousPath: string | null }
  | { readonly kind: "error"; readonly path: string; readonly reason: FolderDropErrorReason };

export interface UseFolderDrop {
  /** The notice to render (`FolderDropConfirmation`/`FolderDropError`), or `null` when neither
   *  should be visible. */
  readonly notice: FolderDropNotice | null;
  /** Dismisses the current notice immediately — `FolderDropConfirmation`/`FolderDropError`'s
   *  `onDismiss`. A no-op when nothing is showing. */
  readonly dismiss: () => void;
  /** Re-attempts the custom-root call for the last path this hook tried — `FolderDropError`'s
   *  `onRetry`. A no-op before any drop has been handled. */
  readonly retry: () => void;
  /** Pass through `AssistantDock`'s imperative handle to the wrapping `<aside onDropCapture={...}>`
   *  in `App.tsx` (capture phase, same reasoning as the desktop original: this must see the raw
   *  event before `@jini-ai/chat`'s own bubble-phase drop handling expands a folder into per-leaf
   *  files). A no-op (falls through to the ordinary attachment-upload path) when running in a plain
   *  browser tab (no `window.tovuFiles`) or when nothing dropped was a folder. */
  readonly handleDropCapture: (event: DragEvent<HTMLElement>) => void;
}

export interface UseFolderDropInput {
  /** Populated by `ChatPane` itself once mounted — the same ref `use-composer-voice-input.hooks.ts`
   *  already inserts a voice transcript through. */
  readonly composerHandle: React.RefObject<ChatPaneComposerHandle | null>;
}

export interface UseFolderDropDeps {
  /** Test seam — defaults to the real `getFolderDropPort(undefined)` (`window.tovuFiles`). */
  readonly getPort?: () => FolderDropPort | null;
  /** Test seam — defaults to the real `api.setFsFilesCustomRoot`. */
  readonly setCustomRoot?: (path: string) => Promise<{ path: string }>;
  /** Test seam — defaults to the real `api.getFsFilesCustomRoot`. */
  readonly getCustomRoot?: () => Promise<{ path: string | null }>;
  /** Milliseconds before a confirmation auto-dismisses. Defaults to `ui.spec.md`'s `4000`. */
  readonly autoDismissMs?: number;
}

const DEFAULT_AUTO_DISMISS_MS = 4000;

/**
 * The real port lookup, used when no `getPort` seam is passed. Module-level on purpose, not an inline
 * default inside the hook: `handleDropCapture` lists `getPort` as a dependency, so an inline arrow
 * gave it a new identity on every render, and `useFolderDropBridge` (`AssistantDock.hooks.tsx`)
 * re-publishes on every identity change. Reads `window.tovuFiles` at call time, same as before.
 *
 * @complexity Time/space: O(1).
 */
function defaultGetPort(): FolderDropPort | null {
  return getFolderDropPort(undefined);
}

/**
 * Classifies a failed `setCustomRoot` call into `errors.spec.md`'s three-way `FolderDropError`
 * reason. The server (`routes/fs-files/custom-root.ts`) answers every `CustomFsRootError` with the
 * SAME `code: "INVALID_PATH"` regardless of which of its three messages fired, so the two validation
 * reasons this feature can realistically hit (a path recovered from a live directory entry is always
 * absolute — see `folder-drop.ts` — so "not absolute" is not a reachable case here) are told apart by
 * the message text itself; anything else (network failure, 500, a non-`ApiError` throw) is reported
 * as the endpoint being unreachable rather than guessed at.
 *
 * @complexity Time/space: O(1).
 */
function reasonForCustomRootError(err: unknown): FolderDropErrorReason {
  if (!(err instanceof ApiError) || err.code !== "INVALID_PATH") return "endpoint-unreachable";
  const message = typeof err.body?.error === "string" ? err.body.error : "";
  return message.includes("does not exist") ? "does-not-exist" : "not-a-directory";
}

/**
 * Owns the folder-drop notice state and the composer/custom-root side effects a drop triggers.
 *
 * @complexity Time: O(n) in the number of dragged items per drop (via `folderPathsFromDataTransfer`);
 *   space: O(1) beyond that same per-drop array.
 */
export function useFolderDrop(input: UseFolderDropInput, deps: UseFolderDropDeps = {}): UseFolderDrop {
  const getPort = deps.getPort ?? defaultGetPort;
  const setCustomRoot = deps.setCustomRoot ?? api.setFsFilesCustomRoot;
  const getCustomRoot = deps.getCustomRoot ?? api.getFsFilesCustomRoot;
  const autoDismissMs = deps.autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS;

  const [notice, setNotice] = useState<FolderDropNotice | null>(null);
  const lastAttemptedPath = useRef<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards every `setState` below against firing after unmount — same guard shape
  // `use-composer-voice-input.hooks.ts`'s sibling `FsFolderIndicator.hooks.ts` already uses.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
    };
  }, []);

  const scheduleAutoDismiss = useCallback(() => {
    if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, autoDismissMs);
  }, [autoDismissMs]);

  const applyCustomRoot = useCallback(
    async (path: string) => {
      lastAttemptedPath.current = path;
      let previousPath: string | null = null;
      try {
        previousPath = (await getCustomRoot()).path;
      } catch {
        // Best-effort only — see this module's own doc on why a failed read never blocks REQ-02.
      }
      try {
        await setCustomRoot(path);
        if (!mountedRef.current) return;
        setNotice({
          kind: "confirmation",
          path,
          replacedPreviousPath: previousPath !== null && previousPath !== path ? previousPath : null,
        });
        scheduleAutoDismiss();
      } catch (err) {
        if (!mountedRef.current) return;
        setNotice({ kind: "error", path, reason: reasonForCustomRootError(err) });
      }
    },
    [getCustomRoot, setCustomRoot, scheduleAutoDismiss],
  );

  const handleDropCapture = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const port = getPort();
      if (port === null) return;
      const folders = folderPathsFromDataTransfer(event.dataTransfer, port.getPathForFile);
      if (folders.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      input.composerHandle.current?.insertText(folders.join(" "));
      // See this module's own doc ("Multiple folders in one drop event") for why the LAST path,
      // specifically, becomes the custom root.
      const target = folders[folders.length - 1] as string;
      void applyCustomRoot(target);
    },
    [getPort, input.composerHandle, applyCustomRoot],
  );

  const dismiss = useCallback(() => {
    if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
    setNotice(null);
  }, []);

  const retry = useCallback(() => {
    if (lastAttemptedPath.current !== null) void applyCustomRoot(lastAttemptedPath.current);
  }, [applyCustomRoot]);

  return { notice, dismiss, retry, handleDropCapture };
}
