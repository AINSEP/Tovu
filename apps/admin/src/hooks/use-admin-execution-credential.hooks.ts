import { useEffect, useState } from "react";
import type { ByokConfig } from "@jini-ai/ui";

import { ApiError, type AdminExecutionCredential, type AdminExecutionCredentialPatch, describeApiError as describeApiErrorDefault } from "../lib/api";
import {
  EXECUTION_NAMESPACE,
  clearLegacyLocalCredential,
  hasUsableAdminKey,
  loadAdminExecutionCredential,
  readLegacyLocalCredential,
  saveAdminExecutionCredential,
} from "../lib/execution-settings";
import { publishSettingsRefresh, subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";

/**
 * @file State for the admin's own BYOK credential — the "Save key" control and the one-time
 * `localStorage`-to-server migration prompt, shared verbatim by `SettingsUi.tsx`'s Execution tab
 * and `AiAssistant.tsx`'s `AdminExecutionMode` (both render `ExecutionTab` over the SAME ledger
 * namespace and now the same server-side credential row; per `AdminExecutionMode`'s own "must never
 * disagree" comment about `useStoredCredential`, the two mounts cannot be allowed to diverge here
 * either — hence one hook rather than two independent implementations).
 *
 * Modeled closely on the already-shipped, owner-reviewed
 * `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts`: explicit save only, the field
 * clears on success, a failed save never touches what is already stored/local. The two differ where
 * the underlying screens differ — this one does not own the whole BYOK form (only the "Save key"
 * affordance under it, since `ExecutionTab` owns the provider chips and other fields via the
 * existing `core.execution` ledger slice) and it additionally owns the migration prompt, which the
 * visitor screen has no equivalent of (there was never a browser-local visitor key to migrate).
 *
 * ## Cross-mount staleness (disclosed residual, closed here)
 *
 * `stored`/`apiKeyStoredExternally` is each mounted instance's OWN copy of one server fact — every
 * `SettingsUi.tsx` mount, every `AiAssistant.tsx` mount, AND `AssistantDock.hooks.tsx`'s own
 * independent `loadAdminExecutionCredential()` call (`useExecutionConfig`'s `hasStoredAdminKey`) are
 * three separate reads of the same row. A save/migrate in ONE of them updated only its own local
 * `stored` state, so the other two kept showing whatever they last fetched — briefly, if the operator
 * happened to remount that screen soon after, or indefinitely for the dock, which mounts once at the
 * app shell and never remounts for the session (`AssistantDock.tsx`'s own header comment). Now wired
 * to `settings-refresh-bus.ts`, the same seam `useSettingsSlice`'s `runSave` already uses for exactly
 * this "same-tab sibling with no shared state" problem: every successful write publishes
 * `EXECUTION_NAMESPACE`, and every mount (including the publisher's own, harmlessly — see
 * `runSave`'s doc for why that redundant self-refresh is accepted rather than tracked around) re-reads
 * on receiving it.
 */

export type AdminByokSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`), mirroring
 *  `features/ai-assistant/rules.ts`'s identical pattern for the sibling site-credential codes.
 *
 * @complexity Time/space: O(1).
 * @overallScore 100
 */
function describeAdminExecutionCredentialError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "EXECUTION_CREDENTIAL_VALIDATION_ERROR") return e.message || "That value was rejected.";
    // Same fail-closed translation `features/ai-assistant/rules.ts`'s `describeApiError` gives the
    // sibling site-credential code — the server has no master secret to encrypt under, and that is
    // an operator-actionable server fact, not a problem with the key that was just typed.
    if (e.code === "SECRET_STORE_UNCONFIGURED")
      return "The server cannot store keys yet: it has no encryption master key. Set TOVU_INTEGRATIONS_ROOT_KEY (hex) in the server environment and restart. Your key was not saved, and nothing is wrong with it.";
  }
  return describeApiErrorDefault(e, fallback);
}

export interface UseAdminExecutionCredentialInput {
  /** The live BYOK half of whichever `ExecutionConfig` the host owns. Read fresh on every
   *  `saveKey()`/`migrateLegacyKey()` call (never captured once), so a save always sends whatever
   *  protocol/baseUrl/model/maxTokens the operator currently has selected. */
  byok: ByokConfig;
  /** How a successful key save clears the just-saved plaintext back out of the host's own state —
   *  same reasoning `use-visitor-credential-form.hooks.ts`'s `saveCredential` documents: leaving it
   *  in React state after it is safely persisted keeps it readable in devtools for no benefit, and
   *  the masked placeholder now carries the "which key" answer the field would otherwise be giving. */
  onByokChange: (next: ByokConfig) => void;
}

export interface AdminExecutionCredentialController {
  /** The server's write-only view of what is currently stored — `null` until the initial GET
   *  settles. Never contains key material. */
  stored: AdminExecutionCredential | null;
  /** Tells `ExecutionTab`'s `apiKeyStoredExternally` prop that an empty key field is not a missing
   *  required field, because a credential already exists server-side. */
  apiKeyStoredExternally: boolean;
  /** The server's `••••<last 4>`, or `undefined` when nothing is stored — feeds `ExecutionTab`'s
   *  `apiKeyPlaceholder`. Always a placeholder, never a value: `byok.apiKey` is untouched by this
   *  controller until an explicit save succeeds. */
  apiKeyPlaceholder: string | undefined;
  saveState: AdminByokSaveState;
  /** Whether {@link saveKey} would do anything right now — the same "typed key OR something already
   *  stored" guard `saveKey` itself applies, exposed so a Save button can disable correctly without
   *  duplicating the rule. */
  canSaveKey: boolean;
  /**
   * Explicit save, called ONLY from a "Save key" button press — never from any debounced or
   * automatic path. Sends the CURRENT `byok` fields (protocol/providerId/baseUrl/model/maxTokens)
   * on every call, with `apiKey` included when the field holds a non-empty value and omitted
   * (server's "leave the stored key alone" contract) otherwise — same shape
   * `use-visitor-credential-form.hooks.ts`'s `saveCredential` sends for the sibling site credential,
   * so the stored row's non-secret companion fields (used server-side as the turn-execution
   * fallback for an empty-field browser) stay in sync with whatever the operator has selected as of
   * this Save press.
   *
   * A no-op when the field is empty AND nothing is stored yet (there is nothing meaningful to
   * write — see {@link canSaveKey}).
   */
  saveKey: () => Promise<void>;
  /** A pre-server-store `localStorage` key this browser still holds, or `null` when there is
   *  nothing to migrate (never had one, already migrated, or the prompt was dismissed this
   *  session). Non-`null` is what a caller renders the migration banner on. */
  legacyKey: string | null;
  /** Confirms the migration: PUTs the legacy key (plus the current `byok` non-secret fields) to the
   *  server, and clears the `localStorage` entry ONLY once that PUT has actually succeeded — a
   *  failed save leaves the local copy fully intact, per the design's explicit "no auto-clear"
   *  requirement. */
  migrateLegacyKey: () => Promise<void>;
  /** Declines the prompt for the rest of this mount — no `localStorage` change either way. The
   *  design's "no auto-clear" rule means a decline must not delete the local key, so the prompt is
   *  free to reappear on a later mount (a page reload, navigating back to this tab); that is a minor
   *  repeat-ask, not a data-loss risk, which is the asymmetry the design accepts. */
  dismissLegacyPrompt: () => void;
}

/**
 * @complexity Time: O(1) per call — one GET on mount, one PUT per explicit save/migrate. Space:
 * O(1) — no caller-controlled collections.
 */
export function useAdminExecutionCredential({
  byok,
  onByokChange,
}: UseAdminExecutionCredentialInput): AdminExecutionCredentialController {
  const [stored, setStored] = useState<AdminExecutionCredential | null>(null);
  const [saveState, setSaveState] = useState<AdminByokSaveState>({ status: "idle" });
  const [legacyKey, setLegacyKey] = useState<string | null>(null);
  const [legacyDismissed, setLegacyDismissed] = useState(false);

  // Hydrate the stored view, on mount AND whenever another mount (or `AssistantDock`'s own separate
  // copy) publishes a change to this same server row — see this file's "Cross-mount staleness" doc
  // above. Silent on failure, same posture `use-visitor-credential-form.hooks.ts` takes for its own
  // GET: a failed read must not put an error next to a key field the operator has not touched yet,
  // and the only visible consequence is that the "already stored" affordances stay at whatever they
  // last held until a refresh works.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadAdminExecutionCredential()
        .then((view) => {
          if (!cancelled) setStored(view);
        })
        .catch(() => undefined);
    };
    refresh();
    // `scope` is `null` ("refresh everything") or the list of namespaces a publisher named — narrow
    // to this credential's own namespace so an unrelated slice's save does not trigger a pointless
    // refetch here, matching `useSettingsSlice`'s identical narrowing.
    const unsubscribe = subscribeToSettingsRefresh((scope) => {
      if (scope && !scope.includes(EXECUTION_NAMESPACE)) return;
      refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Offer the migration prompt only once the server's own state is known AND nothing is already
  // stored there — an admin who already has a server-side credential (migrated earlier, or just
  // saved fresh this session) gets no benefit from being asked to migrate a now-superseded local
  // value, and re-asking would read as the screen not noticing its own save.
  useEffect(() => {
    if (stored === null) return;
    setLegacyKey(stored.isSet ? null : readLegacyLocalCredential());
  }, [stored]);

  async function saveKey(): Promise<void> {
    const apiKey = byok.apiKey.trim();
    if (!hasUsableAdminKey(apiKey, stored)) return; // nothing typed and nothing stored — no-op
    setSaveState({ status: "saving" });
    try {
      const patch: AdminExecutionCredentialPatch = {
        protocol: byok.protocol,
        providerId: byok.providerId,
        baseUrl: byok.baseUrl,
        model: byok.model,
        ...(byok.maxTokens !== undefined ? { maxTokens: byok.maxTokens } : {}),
        ...(apiKey ? { apiKey } : {}),
      };
      const view = await saveAdminExecutionCredential(patch);
      setStored(view);
      setSaveState({ status: "saved" });
      // Tells every other mounted copy of this credential (the other settings screen, the dock) to
      // re-read — see this file's "Cross-mount staleness" doc above.
      publishSettingsRefresh([EXECUTION_NAMESPACE]);
      // Clear the field once the key is safely stored — see this file's `onByokChange` doc.
      if (apiKey) onByokChange({ ...byok, apiKey: "" });
    } catch (error) {
      setSaveState({ status: "error", message: describeAdminExecutionCredentialError(error, "failed to save the key") });
    }
  }

  async function migrateLegacyKey(): Promise<void> {
    if (!legacyKey) return;
    setSaveState({ status: "saving" });
    try {
      const patch: AdminExecutionCredentialPatch = {
        apiKey: legacyKey,
        protocol: byok.protocol,
        providerId: byok.providerId,
        baseUrl: byok.baseUrl,
        model: byok.model,
        ...(byok.maxTokens !== undefined ? { maxTokens: byok.maxTokens } : {}),
      };
      const view = await saveAdminExecutionCredential(patch);
      // Clear the local copy ONLY after the PUT above has actually resolved successfully — the
      // design's explicit ordering requirement (§6: "only after that PUT succeeds does the code
      // clear the localStorage entry"). A throw above skips every line from here down, so a failed
      // migration leaves both the local key AND `legacyKey` state untouched — the prompt stays up
      // and the admin can retry or decline.
      clearLegacyLocalCredential();
      setStored(view);
      setLegacyKey(null);
      setSaveState({ status: "saved" });
      // Same cross-mount notification `saveKey` above sends — a migration is a write to the same row.
      publishSettingsRefresh([EXECUTION_NAMESPACE]);
    } catch (error) {
      setSaveState({ status: "error", message: describeAdminExecutionCredentialError(error, "failed to save the migrated key") });
    }
  }

  function dismissLegacyPrompt(): void {
    setLegacyDismissed(true);
  }

  return {
    stored,
    apiKeyStoredExternally: stored?.isSet === true,
    apiKeyPlaceholder: stored?.isSet ? (stored.masked ?? undefined) : undefined,
    saveState,
    canSaveKey: hasUsableAdminKey(byok.apiKey, stored),
    saveKey,
    legacyKey: legacyDismissed ? null : legacyKey,
    migrateLegacyKey,
    dismissLegacyPrompt,
  };
}
