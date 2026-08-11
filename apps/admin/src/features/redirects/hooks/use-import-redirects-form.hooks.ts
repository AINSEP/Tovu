import { useState } from "react";

import { describeApiError, type AdminRedirectImportResponse, type RedirectImportRule } from "../../../lib/api";
import { useFetchMutation } from "../../../lib/fetch-query";
import { KEYS, parseImportPayload } from "../rules";
import { defaultRedirectsPort } from "./redirects-dependencies.hooks";
import type { RedirectsPort } from "./redirects-port.hooks";

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
 *
 * `port` is injected (see `redirects-port.hooks.ts`); `describeApiError` stays a direct import — it
 * is a pure error-message rule with no I/O, so per the pattern it is not part of the port (see
 * `redirects-port.hooks.ts`'s own doc comment).
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

export function useImportRedirectsForm(port: RedirectsPort): ImportRedirectsFormController {
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
    run: (rules: RedirectImportRule[]) => port.importRedirects(rules),
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

/** Binds the real client — see `redirects-dependencies.hooks.ts`. The zero-argument half of the
 *  `useX(dependencies)` / `useWiredX()` pair; `Redirects.tsx`'s `ImportRedirectsForm` composes this. */
export function useWiredImportRedirectsForm(): ImportRedirectsFormController {
  return useImportRedirectsForm(defaultRedirectsPort);
}
