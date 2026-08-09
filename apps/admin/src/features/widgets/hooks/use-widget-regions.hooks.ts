import { useEffect, useState } from "react";

import { api, describeApiError, type AdminWidgetRegionBinding } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../widgets-i18n";

/**
 * @file Everything the `WidgetRegions` screen does, so `WidgetRegions.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error handling. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/widgets` needs it.
 */

export interface WidgetRegionsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  regions: AdminWidgetRegionBinding[] | null;
  error: string | null;
  newRegionKey: string;
  setNewRegionKey: (value: string) => void;
  binding: boolean;
  bind: () => Promise<void>;
}

export function useWidgetRegions(): WidgetRegionsController {
  const locale = useAdminLocale();
  const [regions, setRegions] = useState<AdminWidgetRegionBinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRegionKey, setNewRegionKey] = useState("");
  const [binding, setBinding] = useState(false);

  function load() {
    api
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
      await api.bindWidgetRegion(regionKey);
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
