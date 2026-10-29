import { useCallback, useEffect, useMemo, useState } from "react";

import { emailApi, type EmailApi, type MailDnsStatus } from "../email-api";
import { errorMessage, useLoad, type LoadView } from "./email-load.hooks";

/**
 * @file Sender & DNS tab state. The sender is two ordinary settings (`core.mail.senderName`,
 * `core.mail.senderEmail`, `features/settings/mail-sender.ts`) saved with the settings API; the
 * next email uses them. DNS is `GET …/mail-dns` on open and `POST …/mail-dns/verify` for
 * **Check again** — neither changes DNS.
 */

export interface SenderValues {
  name: string;
  email: string;
}

export type SaveState = "idle" | "saving" | "saved" | { error: string };

export interface EmailSenderController {
  sender: LoadView<SenderValues>;
  draft: SenderValues;
  setDraft: (next: Partial<SenderValues>) => void;
  dirty: boolean;
  save: () => Promise<void>;
  saveState: SaveState;
  dns: LoadView<MailDnsStatus>;
  checking: boolean;
  checkError: string | null;
  checkAgain: () => Promise<void>;
}

/** One run of address characters: no whitespace, `@`, brackets, quotes or list separators. */
const ADDRESS_CHARS = /^[^\s@<>()[\]",;:\\]+$/;

/** `local@domain` where the domain has a dot with something on both sides. Same acceptance as
 *  `/^[^…]+@[^…]+\.[^…]+$/` over that character class, without its backtracking. */
function isAddress(value: string): boolean {
  const at = value.indexOf("@");
  if (at === -1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!ADDRESS_CHARS.test(local) || !ADDRESS_CHARS.test(domain)) return false;
  const dot = domain.indexOf(".", 1);
  return dot !== -1 && dot < domain.length - 1;
}

/** A plain address or blank (blank = not configured). Pure. */
export function isValidSenderEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || isAddress(trimmed);
}

/** The sender from the effective-settings rows; anything non-string reads as blank. Pure. */
export function readSenderRows(rows: readonly { key: string; value: unknown }[]): SenderValues {
  const value = (key: string) => {
    const found = rows.find((row) => row.key === key)?.value;
    return typeof found === "string" ? found : "";
  };
  return { name: value("senderName"), email: value("senderEmail") };
}

/**
 * @param required.api - the Email API port; a fake in tests.
 * @param optional.onChanged - called after a save so the page's status re-reads.
 */
export function useEmailSender(required: { api: Pick<EmailApi, "readSender" | "saveSender" | "readDns" | "verifyDns"> }, optional: { onChanged?: () => void } = {}): EmailSenderController {
  const { api } = required;
  const { onChanged } = optional;
  const loadSender = useCallback(async () => readSenderRows((await api.readSender()).data), [api]);
  const { view: sender, setData: setSender } = useLoad({ load: loadSender });
  const loadDns = useCallback(() => api.readDns(), [api]);
  const { view: dns, setData: setDns, reload: reloadDns } = useLoad({ load: loadDns });
  const [draft, setDraftState] = useState<SenderValues>({ name: "", email: "" });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const saved = sender.kind === "loaded" ? sender.data : null;
  useEffect(() => { if (saved) setDraftState(saved); }, [saved]);
  const dirty = saved !== null && (draft.name.trim() !== saved.name || draft.email.trim() !== saved.email);

  const setDraft = useCallback((next: Partial<SenderValues>) => {
    setDraftState((current) => ({ ...current, ...next }));
    setSaveState("idle");
  }, []);

  const save = useCallback(async () => {
    if (!saved) return;
    if (!isValidSenderEmail(draft.email)) {
      setSaveState({ error: "Enter one email address, like hello@example.com." });
      return;
    }
    setSaveState("saving");
    const next = { name: draft.name.trim(), email: draft.email.trim() };
    try {
      if (next.name !== saved.name) await api.saveSender({ key: "senderName", value: next.name });
      if (next.email !== saved.email) await api.saveSender({ key: "senderEmail", value: next.email });
      setSender(next);
      setSaveState("saved");
      reloadDns();
      onChanged?.();
    } catch (error) {
      setSaveState({ error: errorMessage(error) });
    }
  }, [api, draft, saved, setSender, reloadDns, onChanged]);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      setDns(await api.verifyDns());
    } catch (error) {
      setCheckError(errorMessage(error));
    } finally {
      setChecking(false);
    }
  }, [api, setDns]);

  return useMemo(() => ({ sender, draft, setDraft, dirty, save, saveState, dns, checking, checkError, checkAgain }),
    [sender, draft, setDraft, dirty, save, saveState, dns, checking, checkError, checkAgain]);
}

/** The real API port. */
export function useWiredEmailSender(optional: { onChanged?: () => void } = {}): EmailSenderController {
  return useEmailSender({ api: emailApi }, optional);
}
