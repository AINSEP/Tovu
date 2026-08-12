import { useEffect, useState } from "react";

import { api, describeApiError, type AdminRecoveryStatus, type AdminRestorePoint } from "../../../lib/api";
import { parseDeepLinkEnvelope } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../recovery-i18n";

/**
 * @file Everything the Recovery SCREEN (the restore-points list + status/banner) does, so
 * `Recovery.tsx`'s exported `Recovery` component is only markup.
 *
 * Extracted verbatim — same state, same order, same two effects, same error strings. The restore
 * ceremony itself (`RestoreFlow`'s `plan`/`confirm`/`execute` state machine) is a separate
 * component with its own hook, `use-restore-flow.hooks.ts` — it is independent state with its own
 * lifecycle, keyed to whichever restore point is currently selected.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/recovery` needs it.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import): this hook already called
 * `useAdminLocale()` for its own error-string translations, so exposing that SAME already-resolved
 * `locale` as a bound `t` (plus the raw value, still needed for `Recovery.tsx`'s local
 * `DegradedBannerView`/`RestorePointsList` subcomponents, which take `locale` directly) on the
 * return value adds no new fetch — `Recovery.tsx` used to call `useAdminLocale()` a second time,
 * entirely redundant with the resolution this hook was already doing internally.
 */

export interface RecoveryController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  status: AdminRecoveryStatus | null;
  points: AdminRestorePoint[] | null;
  error: string | null;
  /** The restore point a "Restore…" row action selected, or the one a resolved deep link matched —
   *  `null` shows the plain list, non-null swaps in `RestoreFlow` (design-spec.md §0.1: a full
   *  inline swap, never a modal-over-list). */
  selected: AdminRestorePoint | null;
  setSelected: (point: AdminRestorePoint | null) => void;
  /** Bound translator — `key` already resolved against the caller's locale, so `Recovery.tsx` never
   *  imports `useAdminLocale`/`recovery-i18n` for the top-level screen. See this file's header. */
  t: (key: string) => string;
  /** Raw resolved locale — `Recovery.tsx`'s local `DegradedBannerView`/`RestorePointsList`
   *  subcomponents take `locale` directly rather than a bound translator. See this file's header. */
  locale: string;
}

export function useRecovery(): RecoveryController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);
  const [status, setStatus] = useState<AdminRecoveryStatus | null>(null);
  const [points, setPoints] = useState<AdminRestorePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminRestorePoint | null>(null);

  function load() {
    setError(null);
    Promise.all([api.getRecoveryStatus(), api.listRecoveryRestorePoints()])
      .then(([statusResult, pointsResult]) => {
        setStatus(statusResult);
        setPoints(pointsResult.items);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load Recovery"))));
  }

  useEffect(load, []);

  // Deep-link arrival (design-spec.md §4.5, ADR-041 §7/ADR-045 §5, INV-04): re-resolve any
  // envelope `Database.tsx` stashed before navigating here. A stale/forged/pruned envelope
  // resolves to `found: false` — an expected, non-exceptional case, not an error toast.
  useEffect(() => {
    if (!points) return;
    const raw = sessionStorage.getItem("recovery-deep-link-envelope");
    if (!raw) return;
    sessionStorage.removeItem("recovery-deep-link-envelope");
    const parsed = parseDeepLinkEnvelope(raw);
    if (!parsed.ok) return;
    api
      .resolveRecoveryDeepLink(parsed.envelope)
      .then((result) => {
        if (result.found && result.restorePoint) {
          const match = points.find((p) => p.id === result.restorePoint!.restorePointId);
          if (match) setSelected(match);
        }
      })
      .catch(() => undefined); // a failed re-verification falls back to the plain list, no alarm
  }, [points]);

  return { status, points, error, selected, setSelected, t: boundT, locale };
}
