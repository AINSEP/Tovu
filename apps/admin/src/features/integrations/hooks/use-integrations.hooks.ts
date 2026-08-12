import { useEffect, useState } from "react";

import type { AdminWebhookSubscription } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as defaultT } from "../integrations-i18n";
import { parseTopics } from "../rules";
import { defaultIntegrationsPort } from "./integrations-dependencies.hooks";
import type { IntegrationsPort } from "./integrations-port.hooks";

/**
 * @file Everything the Integrations LIST screen does, so `Integrations.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts` and `features/posts/hooks/use-posts.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/integrations` needs it.
 *
 * `port` is injected — see `integrations-port.hooks.ts` — rather than importing `lib/api`
 * directly, so a test can describe list/write outcomes against `createFakeIntegrationsPort`
 * instead of stubbing global `fetch`. `useWiredIntegrations` below is the zero-argument pair
 * `Integrations.tsx` actually mounts.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from
 * that hook, not its own `useAdminLocale()`/dictionary import): injected as this hook's second and
 * third parameters. Unlike `use-analytics.hooks.ts`'s `t`-only case, `locale` is ALSO threaded
 * through here — `Integrations.tsx` passes raw `locale` (not just `t`) into `integrationRowMenuItems`
 * (`rules.ts`) and `actionsForWebhookLabel`/`deleteWebhookBody` (`integrations-i18n.tsx`), all three
 * of which take `(locale, ...)` directly rather than a bound translator, so the component still
 * needs the raw value — see `wired-hooks-convention.md`'s own "locale only where genuinely needed"
 * phrasing. `useIntegrations` itself never calls `t`/reads `locale` internally — both exist solely
 * to hand through to the component, same as the port.
 */

export interface IntegrationsController {
  subscriptions: AdminWebhookSubscription[] | null;
  error: string | null;
  formOpen: boolean;
  setFormOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  label: string;
  setLabel: (label: string) => void;
  targetUrl: string;
  setTargetUrl: (targetUrl: string) => void;
  topics: string;
  setTopics: (topics: string) => void;
  saving: boolean;
  formError: string | null;
  /** The subscription a `RowMenu` "Delete" selection is asking to confirm; `null` when the dialog
   *  is shut. */
  pendingDelete: AdminWebhookSubscription | null;
  setPendingDelete: (subscription: AdminWebhookSubscription | null) => void;
  deleting: boolean;
  onCreate: (e: React.FormEvent) => Promise<void>;
  onTogglePause: (subscription: AdminWebhookSubscription) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Bound translator — `key` already resolved against the caller's locale, so `Integrations.tsx`
   *  never imports `useAdminLocale`/`integrations-i18n` itself. See this file's header. */
  t: (key: string) => string;
  /** Raw resolved locale — needed alongside `t` because `rules.ts`/`integrations-i18n.tsx` expose
   *  a few helpers that take `(locale, ...)` directly rather than a bound translator. See this
   *  file's header. */
  locale: string;
}

export function useIntegrations(port: IntegrationsPort, t: (key: string) => string, locale: string): IntegrationsController {
  const [subscriptions, setSubscriptions] = useState<AdminWebhookSubscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [topics, setTopics] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The subscription a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog
  // is closed. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment
  // on why); this is what drives its `open` prop.
  const [pendingDelete, setPendingDelete] = useState<AdminWebhookSubscription | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload(): Promise<void> {
    return port.listIntegrationSubscriptions()
      .then((r) => setSubscriptions(r.subscriptions))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load integrations"));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await port.createIntegrationSubscription({ label, targetUrl, topics: parseTopics(topics) });
      setLabel("");
      setTargetUrl("");
      setTopics("");
      setFormOpen(false);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "failed to create subscription");
    } finally {
      setSaving(false);
    }
  }

  async function onTogglePause(subscription: AdminWebhookSubscription) {
    try {
      await port.pauseIntegrationSubscription({ id: subscription.id, paused: subscription.status !== "paused" });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update subscription");
    }
  }

  /** Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Delete" item
   *  (`setPendingDelete` below), rather than `window.confirm` — see `Roles.tsx`'s `onDeleteRole`
   *  comment for why a `RowMenu` item needs `ConfirmDialog`, not a blocking browser prompt, to hold
   *  the confirm step. Copy is the exact previous sentence, unchanged. */
  async function onDelete() {
    if (!pendingDelete) return;
    const subscription = pendingDelete;
    setDeleting(true);
    try {
      await port.deleteIntegrationSubscription(subscription.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete subscription");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return {
    subscriptions,
    error,
    formOpen,
    setFormOpen,
    label,
    setLabel,
    targetUrl,
    setTargetUrl,
    topics,
    setTopics,
    saving,
    formError,
    pendingDelete,
    setPendingDelete,
    deleting,
    onCreate,
    onTogglePause,
    onDelete,
    t,
    locale,
  };
}

/**
 * Binds the real `/api/.../integrations/subscriptions` client, and a `t` bound to the real
 * resolved locale (`useAdminLocale()`, called here and ONLY here — see this file's header) — see
 * `integrations-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Integrations.tsx`
 * composes this and a test composes {@link useIntegrations} with `createFakeIntegrationsPort` and
 * a fake `t`/`locale`.
 */
export function useWiredIntegrations(): IntegrationsController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT(locale, key);
  return useIntegrations(defaultIntegrationsPort, t, locale);
}
