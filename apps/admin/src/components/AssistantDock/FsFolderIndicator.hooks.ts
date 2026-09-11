import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";

import { api, describeApiError } from "../../lib/api";
import { folderPathsFromDataTransfer, getFsFolderDropPort } from "./fs-folder-drop";

/**
 * @file State for the composer's folder control (`FsFolderIndicator.tsx`) — the operator-facing
 * surface for the assistant's `fs-files` `custom` root (`apps/website`'s
 * `features/fs-files/custom-root-store.ts`). Pulled out of the component per this codebase's
 * standing "component logic belongs in hooks" convention (mirrors `use-composer-voice-input.hooks.ts`,
 * `AssistantDock.hooks.tsx`).
 *
 * This hook only ever sends a PATH — never a file, never a directory listing — to
 * `/api/admin/v1/workspaces/:workspaceId/fs-files/custom-root`. Setting a folder here does not read
 * anything under it; see `custom-root-store.ts`'s own header for the full argument.
 *
 * `onDropCapture`/`onDragOver` (2026-09-10) add a second input method — dragging a folder onto
 * this control — on top of that same PUT, following `apps/desktop`'s already-shipped fleet-chat
 * pattern (`App.tsx`'s `RunnerChatPane.onDropCapture`): see `fs-folder-drop.ts`'s own header for
 * the full capability-gate story. Both handlers are deliberate no-ops outside the desktop shell —
 * they never call `preventDefault`/`stopPropagation` when `getFsFolderDropPort` returns `null` — so
 * a plain browser tab's drag-and-drop behavior (today: `@jini-ai/chat`'s own attachment upload) is
 * left completely alone. A drop reads no file content at any point: `folderPathsFromDataTransfer`
 * only calls `webkitGetAsEntry().isDirectory` (metadata) and the synchronous `getPathForFile`
 * bridge call, both independent of the dropped folder's size.
 */

export interface UseFsFolderIndicator {
  /** The current custom root, `null` when unset, `undefined` while the initial GET is in flight. */
  readonly path: string | null | undefined;
  /** Whether the inline "set a folder" editor is open. */
  readonly editing: boolean;
  /** The editor's uncommitted text-field value — always a plain string, even before `editing`. */
  readonly draft: string;
  /** True while a set/clear request is in flight — disables the editor's own controls. */
  readonly pending: boolean;
  /** The server's own rejection message (e.g. "does not exist"), or `null` when there is none to show. */
  readonly error: string | null;
  readonly setDraft: (value: string) => void;
  readonly startEditing: () => void;
  readonly cancelEditing: () => void;
  readonly submit: () => void;
  readonly clear: () => void;
  /** Capture-phase drop handler — attach as `onDropCapture` on every root this control renders.
   *  See this file's own header for why capture phase and why it no-ops outside the desktop shell. */
  readonly onDropCapture: (event: DragEvent<HTMLElement>) => void;
  /** Only `preventDefault`s (so the browser will actually deliver the drop) when a drop could be
   *  handled here — a plain browser tab's drag-over behavior is otherwise left untouched. */
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
}

/**
 * @complexity O(1) — three network calls total, none proportional to anything caller-controlled.
 */
export function useFsFolderIndicator(): UseFsFolderIndicator {
  const [path, setPath] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards every `setState` below against firing after this component has unmounted (a slow GET
  // outliving a closed dock, most plausibly) — the same guard shape `use-composer-voice-input.hooks.ts`
  // already uses for its own async settlement.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    api
      .getFsFilesCustomRoot()
      .then((res) => {
        if (mountedRef.current) setPath(res.path);
      })
      .catch(() => {
        // A failed initial GET (network hiccup, not yet authenticated) degrades to "unset" rather
        // than an error banner — the operator can still open the editor and try setting one, which
        // will surface its own error if the underlying problem persists.
        if (mountedRef.current) setPath(null);
      });
  }, []);

  const startEditing = useCallback(() => {
    setDraft(path ?? "");
    setError(null);
    setEditing(true);
  }, [path]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  /**
   * The one PUT both `submit` (the editor's typed/pasted value) and `onDropCapture` (a
   * drag-resolved value) send — factored out so a drop reuses exactly the same request, success,
   * and error handling as typing, rather than a second copy of it.
   */
  const submitPath = useCallback((rawValue: string) => {
    const value = rawValue.trim();
    if (value.length === 0) return;
    setPending(true);
    setError(null);
    api
      .setFsFilesCustomRoot(value)
      .then((res) => {
        if (!mountedRef.current) return;
        setPath(res.path);
        setEditing(false);
      })
      .catch((err: unknown) => {
        if (mountedRef.current) setError(describeApiError(err, "Could not set that folder."));
      })
      .finally(() => {
        if (mountedRef.current) setPending(false);
      });
  }, []);

  const submit = useCallback(() => {
    submitPath(draft);
  }, [draft, submitPath]);

  /**
   * Capture phase, deliberately not a bubble-phase `onDrop`: has to see the raw event BEFORE
   * `@jini-ai/chat`'s own bubble-phase drop handler (attached further up this control, on the
   * composer's drop-target wrapper) would expand a dropped folder into synthesized per-leaf `File`
   * objects and stage them as attachments — see `fs-folder-drop.ts`'s doc on
   * `folderPathsFromDataTransfer` for why that expansion loses the folder's own path. Mirrors
   * `apps/desktop`'s `RunnerChatPane.onDropCapture` (`App.tsx`) exactly, one level down: that
   * handler wraps the whole fleet chat pane and inserts the path as composer text; this one wraps
   * just this control and PUTs the path instead, since the admin assistant reads files through the
   * `fs-files` `custom` root rather than having raw filesystem access of its own.
   *
   * No bridge (`getFsFolderDropPort` returns `null`, i.e. a plain browser tab): returns without
   * calling `preventDefault`/`stopPropagation`, so the event falls through to whatever handling
   * already exists — today, `@jini-ai/chat`'s own attachment upload — completely unchanged. A drop
   * that resolves to no folder (a loose file, a text drag) is left alone for the same reason: it
   * becomes a real staged attachment via the composer's existing upload path, not a silently
   * swallowed drop.
   */
  const onDropCapture = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const port = getFsFolderDropPort(typeof window === "undefined" ? undefined : window);
      if (port === null) return;
      const [folderPath] = folderPathsFromDataTransfer(event.dataTransfer, port.getPathForFile);
      if (folderPath === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      submitPath(folderPath);
    },
    [submitPath],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (getFsFolderDropPort(typeof window === "undefined" ? undefined : window) === null) return;
    event.preventDefault();
  }, []);

  const clear = useCallback(() => {
    setPending(true);
    setError(null);
    api
      .clearFsFilesCustomRoot()
      .then(() => {
        if (mountedRef.current) setPath(null);
      })
      .catch((err: unknown) => {
        if (mountedRef.current) setError(describeApiError(err, "Could not clear the folder."));
      })
      .finally(() => {
        if (mountedRef.current) setPending(false);
      });
  }, []);

  return {
    path,
    editing,
    draft,
    pending,
    error,
    setDraft,
    startEditing,
    cancelEditing,
    submit,
    clear,
    onDropCapture,
    onDragOver,
  };
}
