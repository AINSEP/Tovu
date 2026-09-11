import { useCallback, useEffect, useRef, useState } from "react";

import { api, describeApiError } from "../../lib/api";

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

  const submit = useCallback(() => {
    const value = draft.trim();
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
  }, [draft]);

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

  return { path, editing, draft, pending, error, setDraft, startEditing, cancelEditing, submit, clear };
}
