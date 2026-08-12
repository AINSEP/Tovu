import { useEffect, useState } from "react";

import { describeApiError, type AdminWidgetRegionBinding } from "../../../lib/api";
import { navigate as realNavigate } from "../../../lib/router";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../widgets-i18n";
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
 * `t(locale, …)` stays a direct import: a pure `DICT[locale]?.[key] ?? key` lookup with no host
 * boundary, same "pure, no-I/O" category the convention doc names for `describeApiError`.
 */

export interface WidgetRegionsDependencies {
  port: WidgetRegionsPort;
  locale: string;
  navigate: (path: string) => void;
}

export interface WidgetRegionsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  regions: AdminWidgetRegionBinding[] | null;
  error: string | null;
  newRegionKey: string;
  setNewRegionKey: (value: string) => void;
  binding: boolean;
  bind: () => Promise<void>;
}

export function useWidgetRegions({ port, locale, navigate }: WidgetRegionsDependencies): WidgetRegionsController {
  const [regions, setRegions] = useState<AdminWidgetRegionBinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRegionKey, setNewRegionKey] = useState("");
  const [binding, setBinding] = useState(false);

  function load() {
    port
      .listWidgetRegions()
      .then((r) => setRegions(r.regions))
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load regions"))));
  }

  useEffect(load, []);

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
      setError(describeApiError(e, t(locale, "bind failed")));
    } finally {
      setBinding(false);
    }
  }

  return { regions, error, newRegionKey, setNewRegionKey, binding, bind };
}

/**
 * Binds the real `/api/.../widgets/regions` client, the real `useAdminLocale()`, and the real
 * `lib/router` `navigate` — see `widget-regions-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `WidgetRegions.tsx`
 * composes this and a test composes {@link useWidgetRegions} with `createFakeWidgetRegionsPort`.
 */
export function useWiredWidgetRegions(): WidgetRegionsController {
  const locale = useAdminLocale();
  return useWidgetRegions({ port: defaultWidgetRegionsPort, locale, navigate: realNavigate });
}
