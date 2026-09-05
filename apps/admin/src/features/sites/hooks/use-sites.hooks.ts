import { useCallback, useState } from "react";

import { describeApiError, type AdminSiteActivation, type AdminSiteListEntry, type AdminSitesSnapshot } from "@/lib/api";
import { useFetchMutation, useFetchQuery, useInvalidate, type QueryStatus } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { t as defaultT } from "../sites-i18n";
import {
  KEYS,
  SITES_RESOURCE,
  activationOutlook,
  siteNameErrorKey,
  siteWriteErrorKey,
  sitesInDisplayOrder,
  type ActivationOutlook,
} from "../rules";
import { defaultSitesPort } from "./sites-dependencies.hooks";
import type { SitesPort } from "./sites-port.hooks";

/**
 * @file Everything the Sites screen does, so `Sites.tsx` is only markup.
 *
 * One list read plus two writes, in the `useX(port, t)` / `useWiredX()` shape
 * `use-redirects.hooks.ts` establishes. `port` is injected (`sites-port.hooks.ts`) so a test
 * describes outcomes against `createFakeSitesPort` rather than stubbing global `fetch`.
 *
 * ## The one behavior worth stating up front: Activate does not switch anything
 *
 * `activate` persists a choice and returns. The live process keeps serving whatever it booted
 * with — `siteDir()` resolved once, at boot, and `content.db`/uploads/themes all bind off that.
 * So this hook deliberately does NOT optimistically move the "serving" marker: it invalidates the
 * list, the server re-derives `currentSite` from its own live binding, and the row the operator
 * just activated comes back as `pending-restart`, not `serving`. {@link SitesController.activation}
 * carries the server's own restart instructions for the view to render verbatim.
 *
 * The daemon rides the same restart. `daemon-supervisor.ts` threads `TOVU_SITE_DIR` from the
 * parent's own resolved `siteDir()` into every daemon spawn, so until that restart BOTH the API
 * server and the daemon it supervises are still on the old site — there is no window where the two
 * disagree, and the copy this hook's view renders says exactly that rather than implying a
 * half-applied switch.
 *
 * `t` follows the standing i18n rule: the component gets a BOUND `t` from this hook, never its own
 * `useAdminLocale()`/dictionary import (see `use-recovery.hooks.ts`'s header for the original
 * statement). No raw `locale` is threaded alongside — nothing in this feature's `rules.ts` or
 * `sites-i18n.ts` takes a `(locale, ...)` argument.
 *
 * `useContentRefreshSubscription`: `sites/` is filesystem state a terminal `tovu init` (or an
 * assistant run that shells out) can change with this screen open, which is exactly the staleness
 * that bus exists for. The create form is a one-shot submit, not a live diff baseline, so a
 * background invalidate here carries none of the lost-update risk `use-comment-settings.hooks.ts`
 * documents.
 */
export interface SitesController {
  /** `undefined` until the first successful load — the view renders its loading state. */
  snapshot: AdminSitesSnapshot | undefined;
  /** {@link SitesController.snapshot}'s rows in render order (serving first, then by name), or an
   *  empty array before the first load — see `sitesInDisplayOrder`. */
  sites: AdminSiteListEntry[];
  /** Mirrors `useFetchQuery`'s own status, for the caller's first-load guard. */
  listStatus: QueryStatus;
  /** Raw list-read failure, for the full-screen guard (`listStatus === "error" && !snapshot`). */
  listError: Error | null;
  /** The most recent write failure, already translated — `null` when there is none. */
  writeError: string | null;
  /** The deployment capability flag. `false` means Create and Activate would both be refused, so
   *  the view disables them and says why rather than offering a button that 403s. */
  switchingEnabled: boolean;
  /** Whether a previous Activate is still waiting on a restart, and whether it will be honored. */
  outlook: ActivationOutlook;

  createName: string;
  setCreateName: (value: string) => void;
  /** Client-side name check, already translated — `null` while the field is acceptable. */
  createNameError: string | null;
  /** Submits the create form. A no-op while the name is invalid or a write is already in flight. */
  createSite: () => void;
  creating: boolean;
  /** The site name the last successful Create made — drives the success line, cleared on the next
   *  Create attempt. */
  createdName: string | null;

  /** Persists `name` as the next boot's site. Never switches anything — see this file's header. */
  activate: (name: string) => void;
  /** The row currently mid-activate, so exactly one button shows a pending label. */
  activatingName: string | null;
  /** The server's own activate response, including the restart instructions to render verbatim. */
  activation: AdminSiteActivation | null;

  /** Bound translator — see this file's header. */
  t: Translate;
}

export function useSites(port: SitesPort, t: Translate): SitesController {
  const list = useFetchQuery({ key: KEYS.list, fetch: () => port.listSites() });

  // Stable identity (not an inline arrow) so the subscription effect does not resubscribe every
  // render — same note as `use-redirects.hooks.ts`'s own `invalidateList`.
  const invalidate = useInvalidate();
  const invalidateList = useCallback(() => invalidate(KEYS.list), [invalidate]);
  useContentRefreshSubscription(SITES_RESOURCE, invalidateList);

  const [createName, setCreateName] = useState("");
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [activation, setActivation] = useState<AdminSiteActivation | null>(null);
  const [activatingName, setActivatingName] = useState<string | null>(null);

  const createMutation = useFetchMutation({
    run: (name: string) => port.createSite({ name }),
    invalidates: [KEYS.list],
  });
  const activateMutation = useFetchMutation({
    run: (name: string) => port.activateSite(name),
    invalidates: [KEYS.list],
  });

  const nameErrorKey = siteNameErrorKey(createName);

  const createSite = useCallback(() => {
    const name = createName.trim();
    if (siteNameErrorKey(name) !== null) return;
    setCreatedName(null);
    // `.catch` is required even though `mutate` itself never raises `unhandledrejection` (see
    // `MutationResult.mutate`'s own doc): `.then` above it produces a NEW promise, and that one
    // has no handler of its own. The failure is reported through `createMutation.error`.
    createMutation
      .mutate(name)
      .then((result) => {
        setCreatedName(result.site.name);
        setCreateName("");
      })
      .catch(() => {});
  }, [createMutation, createName]);

  const activate = useCallback(
    (name: string) => {
      setActivatingName(name);
      setActivation(null);
      activateMutation
        .mutate(name)
        .then(setActivation)
        .catch(() => {})
        .finally(() => setActivatingName(null));
    },
    [activateMutation],
  );

  const rawWriteError = createMutation.error ?? activateMutation.error;
  const writeErrorKey = rawWriteError === null ? null : siteWriteErrorKey(rawWriteError);

  return {
    snapshot: list.data,
    sites: list.data === undefined ? [] : sitesInDisplayOrder(list.data),
    listStatus: list.status,
    listError: list.error,
    writeError: resolveWriteError(rawWriteError, writeErrorKey, t),
    switchingEnabled: list.data?.switchingEnabled ?? false,
    outlook: list.data === undefined ? { kind: "none" } : activationOutlook(list.data),
    createName,
    setCreateName,
    createNameError: nameErrorKey === null || createName.length === 0 ? null : t(nameErrorKey),
    createSite,
    creating: createMutation.status === "pending",
    createdName,
    activate,
    activatingName,
    activation,
    t,
  };
}

/**
 * The banner copy for a write failure: this feature's own per-code translation when it has one,
 * otherwise `lib/api.ts`'s shared fallback (which already carries the server's own message).
 *
 * Extracted rather than inlined into the returned object so `useSites` itself keeps one branch
 * instead of three, and so the precedence is directly testable.
 *
 * @complexity Time/space: O(1).
 */
function resolveWriteError(error: Error | null, key: string | null, t: Translate): string | null {
  if (error === null) return null;
  return key === null ? describeApiError(error, t("That request failed.")) : t(key);
}

/**
 * Binds the real `/api/.../system/sites` client and a `t` bound to the resolved locale
 * (`useAdminLocale()`, called here and ONLY here — see this file's header).
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Sites.tsx` composes
 * this and a test composes {@link useSites} with `createFakeSitesPort` and a fake `t`.
 */
export function useWiredSites(): SitesController {
  const locale = useAdminLocale();
  const t = useCallback((key: string): string => defaultT(locale, key), [locale]);
  return useSites(defaultSitesPort, t);
}
