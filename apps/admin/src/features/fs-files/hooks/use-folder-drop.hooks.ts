import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ChatPaneComposerHandle } from "@jini-ai/chat/react";
import { useFolderPathDropCapture } from "@jini-ai/ui";

import { api, ApiError } from "../../../lib/api";
import { getFolderDropPort, type FolderDropPort } from "../folder-drop-port";
import { useSerialWrites } from "@/hooks/use-serial-writes.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";

/**
 * @file SPEC-053: wires a dropped folder in the admin chat composer (`AssistantDock`) to (a) the
 * composer's existing text-insertion seam and (b) the `fs-files` `custom` root, so the very next
 * `fs_list_files(root:"custom")` call resolves to the dropped folder with no separate manual step
 * (REQ-02). Mirrors `use-composer-voice-input.hooks.ts`'s "component logic belongs in hooks" split:
 * `AssistantDock.tsx` only renders whatever this returns.
 *
 * **Text insertion always happens; the custom-root set is best-effort on top of it** (`ui.spec.md`
 * §4: "a failed custom-root set must never roll back or block the path text already inserted").
 * `handleDropCapture` is `@jini-ai/ui`'s `useFolderPathDropCapture`, which inserts the path
 * synchronously and only then calls back into the (async) custom-root call, so REQ-01's
 * already-shipped behavior (folder drop -> path, not attachments) can never regress because of
 * anything this hook's network call does.
 *
 * **Multiple folders in one drop event.** `feature.spec.md`/`behavior.spec.md` only ever describe
 * SEQUENTIAL drops for the "last write wins" custom-root rule (§1.2) — dropping two folders at once
 * in a single `DragEvent` is not named. Composer text is `@jini-ai/ui`'s `formatDroppedFolderPaths`,
 * the same format the desktop chat inserts: every recovered folder path, space-joined, in drop
 * order. For the SINGLE `custom` root value (INV-02: at most one at a time), this
 * applies the same "most recent wins" rule one level down and uses the LAST folder in that same drop
 * — a judgment call, not a spec requirement, made because no other rule in the approved spec package
 * covers this case and "last" is the only choice consistent with §1.2's own tie-break for the
 * sequential case.
 *
 * **"Last folder wins" now holds across OVERLAPPING drops, not just sequential ones.** Each drop's
 * `applyCustomRoot` call used to run its own independent read-then-write, so a slow read or a slow
 * write for an older drop could resolve after a newer drop and overwrite it — the server, and the
 * notice shown to the operator, could disagree about which drop was actually last (2026-09-20 fix).
 * `applyCustomRoot` now mints a `useSettlementGeneration` generation synchronously, before any
 * `await`, and runs its read/write through a `useSerialWrites` chain that keeps writes in strict
 * drop order. A drop superseded before its own read starts skips the read entirely; one superseded
 * mid-read never issues its write; one superseded mid-write still completes (the in-flight PUT is
 * not cancelled) but its notice — confirmation or error — is suppressed. The newer drop then runs
 * on an uncontested chain and its own confirmation names the older path as replaced.
 *
 * **Reading the previous root before overwriting it** (`applyCustomRoot`'s `getCustomRoot()` call)
 * is purely cosmetic — it only feeds `FolderDropConfirmation`'s `replacedPreviousPath` wording
 * (`ui.spec.md` §2.1). Its failure is swallowed on purpose: REQ-02's actual set call is unaffected
 * either way, so a flaky read never blocks the feature this hook exists to deliver. Because it now
 * runs inside the same generation-guarded chain, `replacedPreviousPath` reflects the root as it
 * stood after the PRIOR drop's write actually settled, not merely whatever was on the server when
 * this drop started.
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
   *  browser tab (no `window.tovuFiles`) or when nothing dropped was a folder. Its identity never
   *  changes for the hook's lifetime (`useFolderPathDropCapture`), so `useFolderDropBridge`
   *  publishes it once per mount. */
  readonly handleDropCapture: (event: DragEvent<HTMLElement>) => void;
}

export interface UseFolderDropInput {
  /** Populated by `ChatPane` itself once mounted — the same ref `use-composer-voice-input.hooks.ts`
   *  already inserts a voice transcript through. */
  readonly composerHandle: React.RefObject<ChatPaneComposerHandle | null>;
}

export interface UseFolderDropDeps {
  /** Test seam — defaults to the real `getFolderDropPort(undefined)` (`window.tovuFiles`). Called
   *  at render, not at drop; a drop uses the latest committed render's port. */
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
 * The real port lookup, used when no `getPort` seam is passed. Reads `window.tovuFiles`.
 *
 * **Evaluated at render, not at drop.** `useFolderPathDropCapture` takes the port as a value and its
 * handler uses whatever the latest committed render passed. Before the switch to `@jini-ai/ui` this
 * was read inside the drop handler. Both reads see the same value, because `window.tovuFiles` does
 * not change during a page's life: `apps/desktop/src/speech/preload-speech.cts` calls
 * `contextBridge.exposeInMainWorld` synchronously at preload time, and Electron runs a window's
 * preload before any of the page's own scripts. So the bridge already exists (or is permanently
 * absent) when this bundle first renders. Going between `/admin` and the public site is a full
 * navigation, which reloads both the preload and this bundle.
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
 * absolute — see `@jini-ai/ui`'s `folderPathsFromDataTransfer` — so "not absolute" is not a
 * reachable case here) are told apart by the message text itself; anything else (network failure,
 * 500, a non-`ApiError` throw) is reported as the endpoint being unreachable rather than guessed at.
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
 * @complexity Time: O(n) in the number of dragged items per drop (via `@jini-ai/ui`'s
 *   `captureFolderPathDrop`); space: O(1) beyond that same per-drop array.
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

  // See this file's "Last folder wins now holds across OVERLAPPING drops" doc above. `settlement`
  // tells a superseded drop's read/write/notice apart from the newest one; `writes` keeps every
  // drop's read-then-write in strict drop order so a newer drop's PUT never races an older one's.
  const settlement = useSettlementGeneration();
  const writes = useSerialWrites();

  const applyCustomRoot = useCallback(
    (path: string): Promise<void> => {
      lastAttemptedPath.current = path;
      // Minted HERE, synchronously, before this drop even joins the write chain — not inside the
      // queued task below. Two drops handled in the same tick must each see the other's claim before
      // either one's chained task starts running, so the later drop's mint always outranks the
      // earlier one by the time the chain gets to it.
      const generation = settlement.next();
      return writes.run(async () => {
        // A newer drop was minted behind this one before this task got its turn on the chain — skip
        // the read, the write and the notice entirely; this drop has nothing left to contribute.
        if (!settlement.isCurrent(generation)) return;
        let previousPath: string | null = null;
        try {
          previousPath = (await getCustomRoot()).path;
        } catch {
          // Best-effort only — see this module's own doc on why a failed read never blocks REQ-02.
        }
        // A newer drop arrived while this one was reading — never issue this drop's write over it.
        if (!settlement.isCurrent(generation)) return;
        try {
          await setCustomRoot(path);
          if (!mountedRef.current || !settlement.isCurrent(generation)) return;
          setNotice({
            kind: "confirmation",
            path,
            replacedPreviousPath: previousPath !== null && previousPath !== path ? previousPath : null,
          });
          scheduleAutoDismiss();
        } catch (err) {
          // The write itself is not cancelled — it already reached the server — but a superseded
          // drop's failure must not replace whatever the newer drop already confirmed.
          if (!mountedRef.current || !settlement.isCurrent(generation)) return;
          setNotice({ kind: "error", path, reason: reasonForCustomRootError(err) });
        }
      });
    },
    [getCustomRoot, setCustomRoot, scheduleAutoDismiss, settlement, writes],
  );

  const handleDropCapture = useFolderPathDropCapture({
    // See `defaultGetPort`'s doc for why reading the port at render is safe.
    port: getPort(),
    composer: input.composerHandle,
    onFolderPaths: (paths) => {
      // Called only for a swallowed drop, so `paths` is never empty. See this module's own doc
      // ("Multiple folders in one drop event") for why the LAST path becomes the custom root.
      void applyCustomRoot(paths[paths.length - 1] as string);
    },
  });

  const dismiss = useCallback(() => {
    if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
    setNotice(null);
  }, []);

  const retry = useCallback(() => {
    if (lastAttemptedPath.current !== null) void applyCustomRoot(lastAttemptedPath.current);
  }, [applyCustomRoot]);

  return { notice, dismiss, retry, handleDropCapture };
}
