import { useEffect, useRef, useState } from "react";

import { ApiError, describeApiError, type AdminSiteTokenStatus } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { t as defaultT, siteTokenGenerateErrorMessage, siteTokenLoadErrorMessage, siteTokenRevealErrorMessage } from "../security-i18n";
import { defaultSiteTokenPort } from "./site-token-dependencies.hooks";
import type { SiteTokenPort } from "./site-token-port.hooks";

/**
 * @file The Site Token tab's controller — status + reveal + generate, no update/delete/rotate
 * (see `SiteTokenTab.tsx`'s own header for why a rotate/replace flow is deliberately not built).
 *
 * ## Reveal is ONE mechanism, not two
 *
 * An earlier brief had generate show its new value once, at creation, with a "will not be shown
 * again" warning, and every other read stay fingerprint-only. The owner superseded that ("i want
 * that token to be visible to admins or else when it breaks they have no idea whats going on"),
 * so this controller does not build a second, generate-specific reveal path — `reveal()` is the
 * one way this tab ever shows a key value, usable at any time a key is active, including
 * immediately after a successful `generate()` (which does NOT auto-populate `revealedHex` — the
 * operator clicks Reveal same as any other time, consistent with "never shown on page load, only
 * behind an explicit action" applying uniformly rather than making creation a special case).
 *
 * `revealedHex` is local state, not derived from `status`: the value exists nowhere else in this
 * controller (`AdminSiteTokenStatus` never carries it — see that type's own doc), and clearing it
 * (`hideRevealed`) only ever removes it from THIS state, never from the server.
 */

export interface SiteTokenController {
  /** `undefined` until the first status read settles (success or failure). */
  status: AdminSiteTokenStatus | undefined;
  loadError: string | null;
  revealing: boolean;
  revealError: string | null;
  /** The revealed key value, or `null` before the first reveal / after {@link hideRevealed}. */
  revealedHex: string | null;
  /** No-op when nothing is active to reveal. */
  reveal: () => Promise<void>;
  hideRevealed: () => void;
  generating: boolean;
  /** The classified failure (see {@link SiteTokenGenerateFailure}) — `SiteTokenTab.tsx` renders
   *  fixed, kind-specific copy for `"env-active"`/`"already-exists"` and only falls back to
   *  `detail`'s free text for `"generic"`. Kept as the classification itself, not a pre-rendered
   *  string, so the two known cases never get the generic "Couldn't generate a key: …" wrapper —
   *  that copy is about a genuine failure, and neither known case is one. */
  generateError: SiteTokenGenerateFailure | null;
  /** No-op (and leaves `generateError` alone) unless `status.source === "none"` — the tab's own
   *  Generate control is hidden outside that state (sol packet-3 finding 3-1), this is a second,
   *  defensive guard against a stale click. */
  generate: () => Promise<void>;
  t: Translate;
}

/** Classifies a rejected generate call against the two markers `POST .../generate` can send
 *  (`lib/api.ts`'s `generateSiteToken` doc) — same "check `e.code ?? e.message`" shape
 *  `rules.ts`'s `classifyAccessTokenSubmitError` documents for Tier 1, reimplemented locally
 *  rather than imported: this tab has no other reason to depend on that file's provider-catalog
 *  tables. @complexity O(1). */
export type SiteTokenGenerateFailure = { kind: "env-active" } | { kind: "already-exists" } | { kind: "generic"; detail: string };

export function classifySiteTokenGenerateError(e: unknown, t: Translate): SiteTokenGenerateFailure {
  if (!(e instanceof ApiError)) return { kind: "generic", detail: describeApiError(e, t("unknown error")) };
  const marker = e.code ?? e.message;
  if (marker === "ENV_VAR_ACTIVE") return { kind: "env-active" };
  if (marker === "ALREADY_EXISTS") return { kind: "already-exists" };
  return { kind: "generic", detail: describeApiError(e, t("unknown error")) };
}

export function useSiteToken(port: SiteTokenPort, t: Translate, locale: string): SiteTokenController {
  const [status, setStatus] = useState<AdminSiteTokenStatus | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealedHex, setRevealedHex] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<SiteTokenGenerateFailure | null>(null);

  const fetchedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: port/t/locale stable for the mounted controller's lifetime (bound once in useWiredSiteToken); mount guard above prevents double-fetch.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    port
      .status()
      .then((result) => setStatus(result))
      .catch((err: unknown) => setLoadError(siteTokenLoadErrorMessage(locale, describeApiError(err, t("unknown error")))));
  }, []);

  async function reveal(): Promise<void> {
    if (!status?.active || revealing) return;
    setRevealing(true);
    setRevealError(null);
    try {
      const result = await port.reveal();
      if (result.hex) setRevealedHex(result.hex);
    } catch (err) {
      setRevealError(siteTokenRevealErrorMessage(locale, describeApiError(err, t("unknown error"))));
    } finally {
      setRevealing(false);
    }
  }

  function hideRevealed(): void {
    setRevealedHex(null);
  }

  async function generate(): Promise<void> {
    if (status?.source !== "none" || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await port.generate();
      // A freshly-created key is always `"active"` with nothing to mismatch yet — the server
      // stamps `.site-meta.json`'s fingerprint to match in the same request (site-key plan §A.6,
      // `stampSiteKeyFingerprint` in `routes/system/site-token.ts`).
      setStatus({ active: true, source: "file", fingerprint: result.fingerprint, keyFilePath: result.keyFilePath, runtimeMode: result.runtimeMode, state: "active" });
    } catch (err) {
      setGenerateError(classifySiteTokenGenerateError(err, t));
    } finally {
      setGenerating(false);
    }
  }

  return { status, loadError, revealing, revealError, revealedHex, reveal, hideRevealed, generating, generateError, generate, t };
}

/**
 * Binds the real port, and a `t` bound to the real resolved locale — the zero-argument
 * `useX(dependencies)` / `useWiredX()` pair, same shape `useWiredOtherCredentials` documents.
 */
export function useWiredSiteToken(): SiteTokenController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => defaultT(locale, key);
  return useSiteToken(defaultSiteTokenPort, boundT, locale);
}
