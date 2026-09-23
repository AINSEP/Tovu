import { useCallback, useEffect, useState } from "react";

import { describeApiError, type AdminWidgetRegionBinding } from "@/lib/api";
import { navigate as realNavigate } from "@/lib/router";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import { WIDGETS_REGIONS_RESOURCE } from "../rules";
import { t as translate } from "../widgets-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultWidgetRegionsPort } from "./widget-regions-dependencies.hooks";
import type { WidgetRegionsPort } from "./widget-regions-port.hooks";

/**
 * @file Everything the `WidgetRegions` screen does, so `WidgetRegions.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error handling. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/widgets` needs it.
 *
 * `deps.port`/`deps.locale`/`deps.navigate` are injected (see `widget-regions-port.hooks.ts`)
 * rather than reaching for `lib/api`'s `api`, `useAdminLocale()`, and `lib/router`'s `navigate`
 * directly, sharing the `WidgetRegionsPort` `use-widget-region-editor.hooks.ts` also injects.
 * `widgets-i18n.ts`'s own `t(locale, key)` — aliased `translate` here to avoid colliding with this
 * file's own bound `(key) => string` closure — stays a direct import for this hook's OWN error
 * strings: a pure `DICT[locale]?.[key] ?? key` lookup with no host boundary, same "pure, no-I/O"
 * category the convention doc names for `describeApiError`.
 *
 * `deps.t` (standing i18n rule, 2026-08-11 — see `use-widgets-library.hooks.ts`'s identical note):
 * injected so `WidgetRegions.tsx` sources its UI copy from this hook instead of its own
 * `useAdminLocale()`/`WIDGETS_DICT` import.
 *
 * `useContentRefreshSubscription` (staleness-bug generalization pass — see that hook's own header):
 * `load` is pulled into a `useCallback` so it can also be handed to that hook, which re-runs it
 * whenever `widgets_bind_region` (`apps/website/src/features/widgets/agent-tools.ts`) binds a new
 * region from an assistant run this screen otherwise has no way to learn about.
 */

export interface WidgetRegionsDependencies {
  port: WidgetRegionsPort;
  locale: string;
  navigate: (path: string) => void;
  t: Translate;
}

export interface WidgetRegionsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  regions: AdminWidgetRegionBinding[] | null;
  error: string | null;
  newRegionKey: string;
  setNewRegionKey: (value: string) => void;
  binding: boolean;
  bind: () => Promise<void>;
  /** Bound translator — `WidgetRegions.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
}

export function useWidgetRegions({ port, locale, navigate, t }: WidgetRegionsDependencies): WidgetRegionsController {
  const [regions, setRegions] = useState<AdminWidgetRegionBinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRegionKey, setNewRegionKey] = useState("");
  const [binding, setBinding] = useState(false);
  const settlement = useSettlementGeneration();

  const load = useCallback(() => {
    // Claim this call's generation BEFORE the request starts — see `useSettlementGeneration`'s own
    // doc for why a synchronous ref bump, not `useState`, is what makes two overlapping calls each
    // see the other's claim. Needed now that a content refresh can fire more than once per run
    // (mid-run tool progress, see `AssistantDock.hooks.tsx`), so two overlapping `load()` calls have
    // no ordering guarantee on their responses.
    const generation = settlement.next();
    port
      .listWidgetRegions()
      .then((r) => {
        if (!settlement.isCurrent(generation)) return;
        setRegions(r.regions);
      })
      .catch((e) => {
        if (!settlement.isCurrent(generation)) return;
        setError(describeApiError(e, translate(locale, "failed to load regions")));
      });
    // `port`/`settlement` are added — see `use-page-editor.hooks.ts`'s identical note: function-
    // scoped values ESLint's exhaustive-deps rule can see, referentially stable in production, so
    // this changes nothing about when this callback's identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, settlement]);

  useEffect(load, [load]);
  useContentRefreshSubscription(WIDGETS_REGIONS_RESOURCE, load);

  async function bind() {
    const regionKey = newRegionKey.trim();
    if (!regionKey) return;
    setBinding(true);
    setError(null);
    try {
      await port.bindWidgetRegion(regionKey);
      setNewRegionKey("");
      navigate(`/widgets/regions/${regionKey}`);
    } catch (e) {
      setError(describeApiError(e, translate(locale, "bind failed")));
    } finally {
      setBinding(false);
    }
  }

  return { regions, error, newRegionKey, setNewRegionKey, binding, bind, t };
}

/**
 * Binds the real `/api/.../widgets/regions` client, the real `useAdminLocale()`, the real
 * `lib/router` `navigate`, and a `WIDGETS_DICT`-bound translator — see
 * `widget-regions-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `WidgetRegions.tsx`
 * composes this and a test composes {@link useWidgetRegions} with `createFakeWidgetRegionsPort`.
 */
export function useWiredWidgetRegions(): WidgetRegionsController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return useWidgetRegions({ port: defaultWidgetRegionsPort, locale, navigate: realNavigate, t });
}
