import { useCallback, useRef, useState } from "react";

import { describeApiError, type AdminSiteActivation, type AdminSiteListEntry, type AdminSitesSnapshot } from "@/lib/api";
import { useFetchMutation, useFetchQuery, useInvalidate, type QueryStatus } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { t as defaultT } from "../sites-i18n";
import { KEYS, SITES_RESOURCE, readSnapshot, siteNameErrorKey, siteWriteErrorKey, type ActivationOutlook } from "../rules";
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
  /** Also clears {@link SitesController.createdName} — a still-showing "Created." banner must not
   *  survive the operator changing what's in the field (finding 25, 2026-09-05 admin-tooling audit). */
  setCreateName: (value: string) => void;
  /** Client-side name check, already translated — `null` while the field is acceptable. */
  createNameError: string | null;
  /** Submits the create form. A no-op while the name is invalid or a write is already in flight. */
  createSite: () => void;
  creating: boolean;
  /** The site name the last successful Create made — drives the success line. Cleared at the start
   *  of the next Create attempt, and also the moment the operator edits {@link
   *  SitesController.createName} again (via {@link SitesController.setCreateName}), so the banner
   *  can never sit next to an unrelated name. */
  createdName: string | null;

  /** Persists `name` as the next boot's site. Never switches anything — see this file's header. */
  activate: (name: string) => void;
  /** The row currently mid-activate, so exactly one button shows a pending label. */
  activatingName: string | null;
  /** The server's own activate response, including the restart instructions to render verbatim. */
  activation: AdminSiteActivation | null;
  /** {@link SitesController.activation}'s restart prose, or `null` when there has been no activate
   *  this page load. Derived here rather than in the view so `Sites.tsx` stays free of the optional
   *  chain — a pending choice outlives the response that produced it (`persistedSiteName`), so the
   *  view has to render the pending state with and without this. */
  restartInstructions: string | null;

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

  const [createName, setCreateNameRaw] = useState("");
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

  // Check-then-set in-flight guard for Create — same shape and same reason
  // `use-static-publish.hooks.ts`'s `publishingRef` documents: this is a plain `useRef`, not
  // `createMutation.status`, because the read-then-write has to be synchronous to be safe against a
  // second click landing in the SAME tick, before React has re-rendered with `creating` reflecting
  // the first click yet. Cleared in `finally` so a later attempt (after this one settles, success or
  // failure) is never refused.
  const creatingRef = useRef(false);

  // Monotonic per-call id (extracted into `useSettlementGeneration` 2026-09-06, same shape as
  // `use-access-tokens.hooks.ts`'s own `settlement`): two rapid Activate clicks on different rows
  // race two independent requests, and network completion order does not have to match click order.
  const activateSettlement = useSettlementGeneration();

  const nameErrorKey = siteNameErrorKey(createName);

  // The view's own `setCreateName` — every edit to the field also clears a still-showing "Created."
  // banner, so it can never sit next to a name the operator has since changed their mind about
  // (finding 25, 2026-09-05 admin-tooling audit). Kept separate from `setCreateNameRaw`, which
  // `createSite`'s own success handler below uses directly: that reset must NOT clear `createdName`
  // — it runs right after `setCreatedName(result.site.name)` sets the very name the banner reports.
  const setCreateName = useCallback((value: string) => {
    setCreateNameRaw(value);
    setCreatedName(null);
  }, []);

  const createSite = useCallback(() => {
    const name = createName.trim();
    if (siteNameErrorKey(name) !== null) return;
    if (creatingRef.current) return;
    creatingRef.current = true;
    // Clears a stale Activate failure so it cannot mask THIS write's own outcome below — mirrors
    // `use-redirects.hooks.ts`'s `clearOtherWriteErrors`; `mutate` already clears `createMutation`'s
    // own prior error, so only the sibling mutation needs the explicit reset.
    activateMutation.reset();
    setCreatedName(null);
    // `.catch` is required even though `mutate` itself never raises `unhandledrejection` (see
    // `MutationResult.mutate`'s own doc): `.then` above it produces a NEW promise, and that one
    // has no handler of its own. The failure is reported through `createMutation.error`.
    createMutation
      .mutate(name)
      .then((result) => {
        setCreatedName(result.site.name);
        // Raw, not the wrapped `setCreateName` — that also clears `createdName`, which would erase
        // the very name just set on the line above before the banner ever renders it.
        setCreateNameRaw("");
      })
      .catch(() => {})
      .finally(() => {
        creatingRef.current = false;
      });
  }, [activateMutation, createMutation, createName]);

  const activate = useCallback(
    (name: string) => {
      const generation = activateSettlement.next();
      // Clears a stale Create failure so it cannot mask THIS write's own outcome below — see
      // `createSite`'s identical reset of `activateMutation` above.
      createMutation.reset();
      setActivatingName(name);
      setActivation(null);
      activateMutation
        .mutate(name)
        .then((result) => {
          // Superseded by a newer activate call started after this one — that later call owns
          // `activation`/`activatingName` now, and applying this stale result would let whichever
          // request happens to settle LAST win regardless of which row was actually clicked last.
          if (!activateSettlement.isCurrent(generation)) return;
          setActivation(result);
        })
        .catch(() => {})
        .finally(() => {
          if (!activateSettlement.isCurrent(generation)) return;
          setActivatingName(null);
        });
    },
    [activateMutation, createMutation, activateSettlement],
  );

  const view = readSnapshot(list.data);

  return {
    snapshot: list.data,
    sites: view.sites,
    listStatus: list.status,
    listError: list.error,
    writeError: resolveWriteError(createMutation.error ?? activateMutation.error, t),
    switchingEnabled: view.switchingEnabled,
    outlook: view.outlook,
    createName,
    setCreateName,
    createNameError: resolveCreateNameError(createName, nameErrorKey, t),
    createSite,
    creating: createMutation.status === "pending",
    createdName,
    activate,
    activatingName,
    activation,
    restartInstructions: activation?.restartInstructions ?? null,
    t,
  };
}

/**
 * The banner copy for a write failure: this feature's own per-code translation when it has one
 * (`siteWriteErrorKey`), otherwise `lib/api.ts`'s shared fallback, which already carries the
 * server's own message — the "check my own codes first, fall through for the rest" precedence
 * `describeApiError`'s own doc prescribes.
 *
 * Extracted rather than inlined into the returned object so the precedence is directly testable and
 * so `useSites` does not carry its branches.
 *
 * @complexity Time/space: O(1).
 */
function resolveWriteError(error: Error | null, t: Translate): string | null {
  if (error === null) return null;
  const key = siteWriteErrorKey(error);
  return key === null ? describeApiError(error, t("That request failed.")) : t(key);
}

/**
 * The create field's inline error, or `null` when there is nothing to say.
 *
 * An EMPTY field reports nothing rather than "Enter a folder name." — that is the field's initial
 * state, and greeting an operator with a validation error on a form they have not touched is noise,
 * not help. The submit button is disabled in that state instead.
 *
 * @complexity Time/space: O(1).
 */
function resolveCreateNameError(raw: string, key: string | null, t: Translate): string | null {
  if (key === null || raw.length === 0) return null;
  return t(key);
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
