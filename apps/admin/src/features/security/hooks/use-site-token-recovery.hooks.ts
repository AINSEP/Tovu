import { useState } from "react";

import { ApiError, describeApiError, type AdminSiteTokenAffectedWebhook, type AdminSiteTokenStartFreshPreview, type AdminSiteTokenStatus } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { t as defaultT } from "../security-i18n";
import { defaultSiteTokenPort } from "./site-token-dependencies.hooks";
import type { SiteTokenPort } from "./site-token-port.hooks";
import type { SiteTokenGenerateFailure } from "./use-site-token.hooks";

/**
 * @file The Site Token tab's last-resort recovery for a locked site (server:
 * `routes/system/site-token.ts`'s `import` / `start-fresh`): "Paste your old token" and "Start
 * fresh" with one typed confirmation. All state and copy live here; `SiteTokenTab.tsx` only renders.
 *
 * The pasted token is cleared from state as soon as it is accepted. Refusals show the server's own
 * plain sentence (`body.detail`), which always says whether anything changed.
 */

/** The exact phrase "Start fresh" needs typed — the server checks the same string. */
export const START_FRESH_CONFIRMATION = "START FRESH";

export type SiteTokenRecoveryPort = Pick<SiteTokenPort, "importToken" | "previewStartFresh" | "startFresh">;

export interface SiteTokenRecoveryController {
  token: string;
  setToken: (value: string) => void;
  unlocking: boolean;
  unlockError: string | null;
  /** No-op for an empty paste or while a request is in flight. */
  unlock: () => Promise<void>;
  /** `loading` while the preview is fetched; `confirm` once it is shown. */
  startFreshStep: "closed" | "loading" | "confirm";
  preview: AdminSiteTokenStartFreshPreview | null;
  openStartFresh: () => Promise<void>;
  cancelStartFresh: () => void;
  confirmText: string;
  setConfirmText: (value: string) => void;
  canConfirmStartFresh: boolean;
  startingFresh: boolean;
  startFreshError: string | null;
  /** No-op unless {@link canConfirmStartFresh}. */
  startFresh: () => Promise<void>;
  /** What the last successful recovery did, in plain words; `null` before one. */
  resultMessage: string | null;
  t: Translate;
}

/** Whether the tab should offer recovery: saved credentials need a key that is not in place.
 *  @complexity O(1). */
export function isSiteTokenLocked(status: AdminSiteTokenStatus | undefined, generateError: SiteTokenGenerateFailure | null): boolean {
  if (generateError?.kind === "locked") return true;
  return status?.state === "missing-with-data" || status?.state === "mismatch";
}

/** The status card's note for a locked site — replaces "A key is created automatically…", which
 *  is not true there (boot refuses to mint over saved credentials). `null` when not locked.
 *  @complexity O(1). */
export function siteTokenLockedNote(status: AdminSiteTokenStatus | undefined, generateError: SiteTokenGenerateFailure | null, t: Translate): string | null {
  if (status?.state === "env-conflict") return t("Site key environment variables conflict. Set TOVU_SITE_KEY to the existing site key and remove the deprecated variable; nothing was changed.");
  return isSiteTokenLocked(status, generateError) ? t("Your credentials need their original site key — use the card above.") : null;
}

/** The server's own sentence for a refusal, else the shared fallback. @complexity O(1). */
function recoveryErrorMessage(err: unknown, t: Translate): string {
  if (err instanceof ApiError && typeof err.body?.detail === "string") return err.body.detail;
  return describeApiError(err, t("unknown error"));
}

function unlockedMessage(resealed: number, t: Translate): string {
  const base = t("Unlocked. Your saved credentials work again.");
  return resealed > 0 ? `${base} ${t("{count} saved since were moved over.").replace("{count}", String(resealed))}` : base;
}

function startedFreshMessage(affectedWebhooks: readonly AdminSiteTokenAffectedWebhook[], t: Translate): string {
  const base = t("Done. Re-enter any credentials that were removed.");
  if (affectedWebhooks.length === 0) return base;
  const names = affectedWebhooks.map((webhook) => `${webhook.label} (${webhook.targetUrl})`).join(", ");
  return `${base} ${t("Update these webhooks' receivers with their new signing secret:")} ${names}.`;
}

/**
 * @param onRecovered - re-reads the tab's status after a successful recovery.
 */
export function useSiteTokenRecovery(port: SiteTokenRecoveryPort, t: Translate, onRecovered: (() => Promise<void> | void) | undefined): SiteTokenRecoveryController {
  const [token, setToken] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [startFreshStep, setStartFreshStep] = useState<"closed" | "loading" | "confirm">("closed");
  const [preview, setPreview] = useState<AdminSiteTokenStartFreshPreview | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [startingFresh, setStartingFresh] = useState(false);
  const [startFreshError, setStartFreshError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const canConfirmStartFresh = confirmText === START_FRESH_CONFIRMATION && !startingFresh;

  async function unlock(): Promise<void> {
    const pasted = token.trim();
    if (pasted === "" || unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const result = await port.importToken(pasted);
      setToken("");
      setResultMessage(unlockedMessage(result.resealed, t));
      await onRecovered?.();
    } catch (err) {
      setUnlockError(recoveryErrorMessage(err, t));
    } finally {
      setUnlocking(false);
    }
  }

  async function openStartFresh(): Promise<void> {
    setStartFreshStep("loading");
    setStartFreshError(null);
    try {
      setPreview(await port.previewStartFresh());
    } catch (err) {
      setPreview(null);
      setStartFreshError(recoveryErrorMessage(err, t));
    }
    setStartFreshStep("confirm");
  }

  function cancelStartFresh(): void {
    setStartFreshStep("closed");
    setConfirmText("");
    setStartFreshError(null);
  }

  async function startFresh(): Promise<void> {
    if (!canConfirmStartFresh) return;
    setStartingFresh(true);
    setStartFreshError(null);
    try {
      const result = await port.startFresh(confirmText);
      setStartFreshStep("closed");
      setConfirmText("");
      setResultMessage(startedFreshMessage(result.affectedWebhooks, t));
      await onRecovered?.();
    } catch (err) {
      setStartFreshError(recoveryErrorMessage(err, t));
    } finally {
      setStartingFresh(false);
    }
  }

  return {
    token, setToken, unlocking, unlockError, unlock,
    startFreshStep, preview, openStartFresh, cancelStartFresh, confirmText, setConfirmText, canConfirmStartFresh,
    startingFresh, startFreshError, startFresh, resultMessage, t,
  };
}

/** Binds the real port and the resolved locale — same `useWired*` shape as `useWiredSiteToken`. */
export function useWiredSiteTokenRecovery(onRecovered: (() => Promise<void> | void) | undefined): SiteTokenRecoveryController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => defaultT(locale, key);
  return useSiteTokenRecovery(defaultSiteTokenPort, boundT, onRecovered);
}
