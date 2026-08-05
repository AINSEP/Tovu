import { useState } from "react";

import { api, describeApiError, type AdminRedirectImportResponse, type RedirectImportRule } from "../../../lib/api";
import { useFetchMutation } from "../../../lib/fetch-query";
import { KEYS, parseImportPayload } from "../rules";

/**
 * @file The bulk-import affordance (SPEC-037 REQ-04), so `ImportRedirectsForm` in `Redirects.tsx`
 * is only markup.
 *
 * Extracted verbatim — same client-side shape check (now `parseImportPayload` in `rules.ts`), same
 * mutation, same error precedence (parse error before request error). The `207` per-item
 * created/failed breakdown is surfaced directly and never collapsed into a single pass/fail toast —
 * a partial-batch failure is the route's own designed behavior, not an edge case.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/redirects` needs it.
 */

export interface ImportRedirectsFormController {
  raw: string;
  setRaw: (value: string) => void;
  /** Parse/shape error takes precedence over a request error — see the implementation below. */
  error: string | null;
  result: AdminRedirectImportResponse | null;
  importing: boolean;
  submit: (e: React.FormEvent) => void;
}

export function useImportRedirectsForm(): ImportRedirectsFormController {
  const [raw, setRaw] = useState("");
  // Client-side validation only — the JSON never reached the server, so this
  // is not a request failure and does not belong in the mutation's `error`.
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminRedirectImportResponse | null>(null);

  const importRules = useFetchMutation({
    // Typed as the route's own shape, but the value is operator-pasted JSON
    // that has only been checked for "is an array" — see `parseImportPayload` in `rules.ts`. The
    // server is the validator here and reports per-item failures in its `207`; duplicating that
    // schema client-side would be a second source of truth for it.
    run: (rules: RedirectImportRule[]) => api.importRedirects(rules),
    // Replaces the `onImported` callback the parent used to thread down purely
    // so this form could refresh a list it does not own.
    invalidates: [KEYS.list],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setParseError(null);
    setResult(null);
    importRules.reset();

    const parsed = parseImportPayload(raw);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }

    // A partial batch (the route's `207`) RESOLVES — it is a result to render,
    // not a failure — so only a transport/route error lands in `catch`, where
    // the mutation's own `error` already holds the message.
    try {
      setResult(await importRules.mutate(parsed.rules));
    } catch {
      /* surfaced via `importRules.error` below */
    }
  }

  const error = parseError ?? (importRules.error ? describeApiError(importRules.error, "Import failed") : null);
  const importing = importRules.status === "pending";

  return { raw, setRaw, error, result, importing, submit };
}
