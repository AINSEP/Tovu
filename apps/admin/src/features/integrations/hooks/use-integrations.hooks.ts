import { useEffect, useState } from "react";

import { api, type AdminWebhookSubscription } from "../../../lib/api";
import { parseTopics } from "../rules";

/**
 * @file Everything the Integrations LIST screen does, so `Integrations.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts` and `features/posts/hooks/use-posts.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/integrations` needs it.
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
}

export function useIntegrations(): IntegrationsController {
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
    return api.listIntegrationSubscriptions()
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
      await api.createIntegrationSubscription({ label, targetUrl, topics: parseTopics(topics) });
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
      await api.pauseIntegrationSubscription({ id: subscription.id, paused: subscription.status !== "paused" });
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
      await api.deleteIntegrationSubscription(subscription.id);
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
  };
}
