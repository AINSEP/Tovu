import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetchQuery, useFetchMutation, useCachedLoader } from "@jini-ai/ui/fetch-query";
import { useConfirmRequest } from "@jini-ai/admin/react";
import { describeApiError } from "@/lib/api";
import { subscribeToSettingsRefresh, publishSettingsRefresh } from "@/lib/settings-refresh-bus";
import { useAdminBootScope } from "@/lib/admin-boot-scope";
type Grant = { enabled: boolean; canEdit: boolean };
interface SiteGrantPort<T extends Grant> {
  read(required: Record<string, never>, optional?: Record<string, never>): Promise<T>;
  write(required: Omit<T, "canEdit"> & { riskAcknowledged: boolean }, optional?: Record<string, never>): Promise<T>;
}
/** Both site grants use Jini's query/invalidation owner and cache lifecycle.
 * @param required - Injected authenticated API and cache/namespace identity.
 * @returns Server truth, its load error and a shared cache-replacement port; subscribes until unmount.
 * @example useAssistantOwnerGrantSettings({ port, namespace, key });
 * @complexity O(1) hook state plus bounded API payload; one read per invalidation. */
export function useAssistantOwnerGrantSettings<T extends Grant>(required: { port: SiteGrantPort<T>; namespace: string; key: readonly string[] }, _optional = {}) {
  const { queryScope, checking } = useAdminBootScope();
  const key = useMemo(() => [...required.key, queryScope], [required.key, queryScope]);
  const fetchSettings = useCallback(() => required.port.read({}), [required.port]);
  const query = useFetchQuery({ key, fetch: fetchSettings }, { enabled: !checking, staleTime: Infinity });
  const loader = useCachedLoader({ key, fetch: fetchSettings }, { staleTime: Infinity });
  const refetch = query.refetch;
  useEffect(() => subscribeToSettingsRefresh(namespaces => {
    if (namespaces === null || namespaces.includes(required.namespace)) refetch();
  }), [refetch, required.namespace]);
  return { settings: query.data ?? null, loadError: query.error?.message ?? null, loader };
}
/** Host owner policy around Jini confirmation/mutation. The lock spans any consent and persistence,
 * so repeated toggle clicks cannot issue overlapping grant changes. A rejected write retains
 * server truth; only successful responses update the shared dock/panel query.
 * @param required - API/copy/cache ports for a specific site-owner grant.
 * @param optional - Injectable Jini confirmation hook and the host's per-grant enable policy.
 * @returns Controller; save errors retain server truth and expose the actual API error.
 * @example useAssistantOwnerGrant({ port, namespace, key, title, dangers, confirmLabel, failure });
 * @complexity O(1) per change plus bounded setting serialization; no optimistic grant. */
export function useAssistantOwnerGrant<T extends Grant>(required: {
  port: SiteGrantPort<T>; namespace: string; key: readonly string[]; title: string;
  dangers: readonly string[]; confirmLabel: string; failure: string; t?: (key: string) => string;
}, optional: { useConfirmation?: typeof useConfirmRequest; confirmEnable?: boolean } = {}) {
  const t = required.t ?? ((key: string) => key);
  const state = useAssistantOwnerGrantSettings(required);
  const confirmation = (optional.useConfirmation ?? useConfirmRequest)({});
  const mutation = useFetchMutation({ run: ({ input }: { input: Omit<T, "canEdit"> & { riskAcknowledged: boolean } }) => required.port.write(input) });
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  async function save(input: { settings: Omit<T, "canEdit"> }, _options = {}) {
    if (locked.current || !state.settings?.canEdit || state.loadError) return;
    locked.current = true; setBusy(true); setSaveError(null);
    try {
      const enabling = input.settings.enabled && !state.settings.enabled;
      const needsConfirmation = optional.confirmEnable !== false && enabling;
      if (needsConfirmation && !await confirmation.confirm({ dialog: {
        title: t(required.title), body: required.dangers.map(t).join("\n"),
        confirmLabel: t(required.confirmLabel), cancelLabel: t("Cancel"), tone: "danger",
      } })) return;
      const saved = await mutation.mutate({ input: { ...input.settings, riskAcknowledged: needsConfirmation } });
      state.loader.replace({ value: saved });
      publishSettingsRefresh([required.namespace]);
    } catch (error) { setSaveError(describeApiError(error, required.failure)); }
    finally { locked.current = false; setBusy(false); }
  }
  return { ...state, busy, saveError, save, dialog: { ...confirmation.dialog, onCancel: () => {
    // Keep the opener enabled while the modal owns focus so cancellation can restore it.
    // Release the UI's waiting state in the same commit that closes consent. Otherwise the
    // native dialog tries to restore focus while its opener is temporarily disabled.
    // The synchronous lock remains held until save's finally block, so re-entry stays denied.
    setBusy(false);
    confirmation.dialog.onCancel();
  } } };
}
