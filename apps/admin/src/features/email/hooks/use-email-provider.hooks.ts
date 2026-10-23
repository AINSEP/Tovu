import { useCallback, useMemo, useState } from "react";

import { emailApi, type EmailApi, type MailProviderConfiguration, type MailProviderConfigurationReport, type MailProviderCredentialInput } from "../email-api";
import { errorMessage, useLoad, type LoadView } from "./email-load.hooks";

/**
 * @file Provider tab state: the installed providers (`GET …/mail-providers`), a key form per
 * provider (`PUT …/:id/credential` — saves or rotates WITHOUT switching), and the switch
 * (`POST …/:id/activate`, which moves both lanes). Everything shown comes from the providers'
 * own declared setup fields; nothing here names a vendor.
 */

export type ProviderNotice = { providerId: string; tone: "ok" | "error"; text: string } | null;

export interface EmailProviderController {
  view: LoadView<MailProviderConfigurationReport>;
  reload: () => void;
  drafts: Record<string, MailProviderCredentialInput>;
  setDraftField: (providerId: string, key: keyof MailProviderCredentialInput, value: string) => void;
  revealed: Record<string, boolean>;
  toggleReveal: (providerId: string) => void;
  busyId: string | null;
  notice: ProviderNotice;
  saveKey: (provider: MailProviderConfiguration) => Promise<void>;
  /** The provider waiting for the switch confirmation, or null. */
  pendingSwitch: MailProviderConfiguration | null;
  askSwitch: (provider: MailProviderConfiguration | null) => void;
  confirmSwitch: () => Promise<void>;
}

/** Whether a provider already sends both lanes (nothing left to switch). Pure. */
export function isFullyActive(provider: MailProviderConfiguration): boolean {
  return provider.lanes.includes("transactional") && provider.lanes.includes("bulk");
}

/** The body a key save sends: trimmed, blank parts left out (a rotation may change just one). Pure. */
export function credentialBody(draft: MailProviderCredentialInput | undefined): MailProviderCredentialInput {
  const out: MailProviderCredentialInput = {};
  for (const key of ["token", "username", "baseUrl"] as const) {
    const value = draft?.[key]?.trim();
    if (value) out[key] = value;
  }
  return out;
}

/**
 * @param required.api - the Email API port; a fake in tests.
 * @param optional.onChanged - called after a save or switch so the page's status re-reads.
 */
export function useEmailProvider(required: { api: Pick<EmailApi, "listProviders" | "saveProviderKey" | "activateProvider"> }, optional: { onChanged?: () => void } = {}): EmailProviderController {
  const { api } = required;
  const { onChanged } = optional;
  const load = useCallback(() => api.listProviders(), [api]);
  const { view, reload } = useLoad({ load });
  const [drafts, setDrafts] = useState<Record<string, MailProviderCredentialInput>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ProviderNotice>(null);
  const [pendingSwitch, setPendingSwitch] = useState<MailProviderConfiguration | null>(null);

  const setDraftField = useCallback((providerId: string, key: keyof MailProviderCredentialInput, value: string) => {
    setDrafts((all) => ({ ...all, [providerId]: { ...all[providerId], [key]: value } }));
    // Typing answers "Enter the key first." — drop that hint so it doesn't linger next to a filled field.
    setNotice((current) => (current?.providerId === providerId && current.text === "Enter the key first." ? null : current));
  }, []);
  const toggleReveal = useCallback((providerId: string) => setRevealed((all) => ({ ...all, [providerId]: !all[providerId] })), []);

  const saveKey = useCallback(async (provider: MailProviderConfiguration) => {
    const body = credentialBody(drafts[provider.id]);
    if (!provider.credential.saved && !body.token) {
      setNotice({ providerId: provider.id, tone: "error", text: "Enter the key first." });
      return;
    }
    setBusyId(provider.id);
    setNotice(null);
    try {
      await api.saveProviderKey({ providerId: provider.id, input: body });
      setDrafts((all) => ({ ...all, [provider.id]: {} }));
      setNotice({ providerId: provider.id, tone: "ok", text: "Key saved." });
      reload();
      onChanged?.();
    } catch (error) {
      setNotice({ providerId: provider.id, tone: "error", text: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }, [api, drafts, reload, onChanged]);

  const confirmSwitch = useCallback(async () => {
    const provider = pendingSwitch;
    if (!provider) return;
    setBusyId(provider.id);
    setNotice(null);
    try {
      await api.activateProvider({ providerId: provider.id });
      setNotice({ providerId: provider.id, tone: "ok", text: "Now sending with this provider." });
      reload();
      onChanged?.();
    } catch (error) {
      setNotice({ providerId: provider.id, tone: "error", text: errorMessage(error) });
    } finally {
      setBusyId(null);
      setPendingSwitch(null);
    }
  }, [api, pendingSwitch, reload, onChanged]);

  return useMemo(() => ({
    view, reload, drafts, setDraftField, revealed, toggleReveal, busyId, notice, saveKey, pendingSwitch, askSwitch: setPendingSwitch, confirmSwitch,
  }), [view, reload, drafts, setDraftField, revealed, toggleReveal, busyId, notice, saveKey, pendingSwitch, confirmSwitch]);
}

/** The real API port. */
export function useWiredEmailProvider(optional: { onChanged?: () => void } = {}): EmailProviderController {
  return useEmailProvider({ api: emailApi }, optional);
}
