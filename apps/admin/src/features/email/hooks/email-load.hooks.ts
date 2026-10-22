import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";

/**
 * @file The one read-state shape every Email tab uses: loading, 403, failed (with the server's
 * safe message), or loaded. A failed read is never shown as an empty list or "not set up".
 */

export type LoadView<T> =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; data: T };

/** The server's caller-safe message for a failed request, or a generic line. Pure. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}

/** Whether a failure is a permission refusal (403). Pure. */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

/**
 * Runs `load` on mount and on `reload`; a stale answer (unmounted or superseded) is dropped.
 * @param required.load - the read; its identity is the dependency, so pass a stable function.
 */
export function useLoad<T>(required: { load: () => Promise<T> }): { view: LoadView<T>; reload: () => void; setData: (data: T) => void } {
  const { load } = required;
  const [view, setView] = useState<LoadView<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setView((previous) => (previous.kind === "loaded" ? previous : { kind: "loading" }));
    load().then(
      (data) => { if (live) setView({ kind: "loaded", data }); },
      (error: unknown) => { if (live) setView(isForbidden(error) ? { kind: "forbidden" } : { kind: "error", message: errorMessage(error) }); },
    );
    return () => { live = false; };
  }, [load, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback((data: T) => setView({ kind: "loaded", data }), []);
  return { view, reload, setData };
}
