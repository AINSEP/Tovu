import { useEffect, useRef, useState } from "react";
import type { ByokConfig } from "@jini-ai/ui";

import { ApiError, type AdminExecutionCredential, type AdminExecutionCredentialPatch, describeApiError as describeApiErrorDefault } from "../lib/api";
import {
  EXECUTION_NAMESPACE,
  clearLegacyLocalCredential,
  hasTypedAdminKey,
  readLegacyLocalCredential,
} from "../lib/execution-settings";
import type { Translate } from "../lib/dictionary-translator";
import { publishSettingsRefresh, subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";
import {
  STORED_KEY_OTHER_PROVIDER_COPY,
  hasUsableKey,
  storedKeyBlocksProbe,
  storedKeyIsForOtherEndpoint as storedKeyIsForOtherEndpointRule,
} from "../lib/stored-credential-endpoint";
import { defaultAdminExecutionCredentialPort } from "./admin-execution-credential-dependencies.hooks";
import type { AdminExecutionCredentialPort } from "./admin-execution-credential-port.hooks";
import { useSerialWrites } from "./use-serial-writes.hooks";

/**
 * @file State for the admin's own BYOK credential — the "Save key" and "Save settings" controls and
 * the one-time `localStorage`-to-server migration prompt, shared verbatim by `SettingsUi.tsx`'s Execution tab
 * and `AiAssistant.tsx`'s `AdminExecutionMode` (both render `ExecutionTab` over the SAME ledger
 * namespace and now the same server-side credential row; per `AdminExecutionMode`'s own "must never
 * disagree" comment about `useStoredCredential`, the two mounts cannot be allowed to diverge here
 * either — hence one hook rather than two independent implementations).
 *
 * Modeled closely on the already-shipped, owner-reviewed
 * `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts`: explicit save only, the field
 * clears on success, a failed save never touches what is already stored/local. The two differ where
 * the underlying screens differ — this one does not own the whole BYOK form (only the "Save key"
 * affordance under the key field and the "Save settings" affordance at the foot of the card, since
 * `ExecutionTab` owns the provider chips and the fields themselves via the existing `core.execution`
 * ledger slice) and it additionally owns the migration prompt, which the visitor screen has no
 * equivalent of (there was never a browser-local visitor key to migrate).
 *
 * ## One button per patch (owner ruling, 2026-09-02)
 *
 * There used to be ONE control here, writing the key and the row's non-secret companion fields
 * together. That overload is what made the screen lie: pressing it with a blank field sent a patch
 * with no `apiKey` at all and still answered "Saved to the server, encrypted." Patching the message
 * left the cause in place, and disabling the button on a blank field broke the only way to save a
 * model change. The split closes both: `saveKey` writes `{ apiKey }`, `saveSettings` writes the
 * non-secret fields and never an `apiKey` property, and each carries its own save state so neither
 * can report the other's work.
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
 *
 * `port` (the two functions that reach `api.getAdminExecutionCredential`/`api.setAdminExecutionCredential`
 * under the hood) is injected — see `admin-execution-credential-port.hooks.ts` for exactly what is and
 * is not in it, and why. `useWiredAdminExecutionCredential` below is the zero-argument pair
 * `SettingsUi.tsx`/`AiAssistant.tsx` actually mount; `AssistantDock.hooks.tsx`'s own separate
 * `loadAdminExecutionCredential()` call (this file's "Cross-mount staleness" doc above) is a
 * different hook entirely, out of scope here.
 */

export type AdminByokSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/**
 * {@link AdminByokKeyFooter}'s status line, as a single string (or `null` to render nothing) — the
 * four mutually-exclusive `saveState.status` checks that used to sit directly in
 * `AdminByokKeyFooter`'s JSX (`components/AdminByokKeyPanel.tsx`), pulled out as a top-level pure
 * function per the complexity-ceiling brief. `isStored` takes the already-narrowed boolean rather
 * than the full `stored` record, so this function has no dependency on
 * `AdminExecutionCredentialController`'s shape beyond the one field it reads.
 *
 * @param storedKeyIsForOtherEndpoint - The controller's flag of the same name. While idle, the line
 *   then asks for this provider's key instead of reporting a stored key this provider cannot use —
 *   the same ask, and the same dictionary key, as the visitor screen's key line.
 * @param t - The host screen's translator. Defaults to English passthrough.
 * @complexity O(1).
 */
export function resolveByokFooterStatusLine(
  status: AdminByokSaveState["status"],
  isStored: boolean,
  storedKeyIsForOtherEndpoint = false,
  t: Translate = (key) => key,
): string | null {
  if (status === "saving") return t("Saving…");
  if (status === "saved") return t("Saved to the server, encrypted.");
  if (status !== "idle") return null;
  if (storedKeyIsForOtherEndpoint) return t(STORED_KEY_OTHER_PROVIDER_COPY);
  return t(isStored ? "Stored on the server, encrypted. Paste a new key to replace it." : "Paste your key, then press Save key.");
}

/**
 * The key field's placeholder: the server's mask for a key stored for the form's endpoint, otherwise
 * `undefined`. Under another provider the mask would read as a key saved for that provider — the owner's
 * report showed the Google key's `••••mw4w` in OpenAI's field. Same rule as the visitor screen's
 * `visitorCredentialApiKeyPlaceholder`.
 *
 * @param stored - The server's view, or `null` before it loads.
 * @param storedKeyIsForOtherEndpoint - The controller's flag of the same name.
 * @returns The mask, or `undefined` for an empty placeholder.
 * @complexity O(1).
 */
export function resolveByokApiKeyPlaceholder(
  stored: AdminExecutionCredential | null,
  storedKeyIsForOtherEndpoint: boolean,
): string | undefined {
  if (storedKeyIsForOtherEndpoint || !stored?.isSet) return undefined;
  return stored.masked ?? undefined;
}

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
   *  required field, because a credential already exists server-side FOR THE FORM'S ENDPOINT. A key
   *  stored for another endpoint does not count (the server will not send it here), so after a
   *  provider switch the field is required again and Test connection waits for a typed key. Same rule
   *  as the visitor screen: `lib/stored-credential-endpoint.ts`'s `hasUsableKey`. */
  apiKeyStoredExternally: boolean;
  /** The server's `••••<last 4>`, or `undefined` when nothing is stored or the stored key belongs to
   *  another endpoint (under a different provider it would read as that provider's key) — feeds
   *  `ExecutionTab`'s `apiKeyPlaceholder`. Always a placeholder, never a value: `byok.apiKey` is
   *  untouched by this controller until an explicit save succeeds. */
  apiKeyPlaceholder: string | undefined;
  /** A key is stored, but the server saved it for another endpoint than the form's (a provider
   *  switch). Drives the key footer's "paste a key for this one" line. See
   *  `lib/stored-credential-endpoint.ts`'s `storedKeyIsForOtherEndpoint`; `false` until the stored
   *  view loads. */
  storedKeyIsForOtherEndpoint: boolean;
  /** Feeds `ExecutionTab`'s `canDiscoverModels`: `false` only when nothing is typed and the stored key
   *  belongs to another endpoint, the one discovery the server can only refuse. `ExecutionTab` reads
   *  it but never probes merely because it turned `true` — "Save settings" re-pointing the stored row
   *  flips it, and that must not send the old provider's key to the new endpoint unasked. */
  canDiscoverModels: boolean;
  /** The "Save key" button's own save state — and the migration prompt's, which writes the same
   *  key. Never advanced by {@link saveSettings}; see {@link settingsSaveState}. */
  saveState: AdminByokSaveState;
  /** The "Save settings" button's own save state, deliberately separate from {@link saveState}.
   *
   *  One shared state is what made the old single control dishonest: its status line said "Saved to
   *  the server, encrypted." after a press that sent no key at all. Two buttons that write two
   *  disjoint patches need two answers, so each owns its own status line and neither can report the
   *  other's work. */
  settingsSaveState: AdminByokSaveState;
  /** Whether {@link saveKey} would do anything right now — the same "is there a key in the field"
   *  guard `saveKey` itself applies, exposed so the Save key button can disable correctly without
   *  duplicating the rule.
   *
   *  Derived synchronously from the trimmed field on every render, never debounced: a delayed
   *  evaluation would leave the button enabled for the moment right after the field is cleared,
   *  which is the bug this rule exists to close, merely shortened. */
  canSaveKey: boolean;
  /**
   * Explicit save, called ONLY from a "Save key" button press — never from any debounced or
   * automatic path. Writes the KEY and nothing else: the patch is `{ apiKey }`, with no
   * protocol/providerId/baseUrl/model/maxTokens riding along.
   *
   * That narrowing (owner ruling, 2026-09-02) is the fix for a whole defect class rather than one
   * bug. A control that wrote two different things could not honestly report what it had just done,
   * and the "which of my two jobs did I do" bookkeeping that answer needed was itself the thing that
   * let an `apiKey: ""` reach the server. A button with one job needs no bookkeeping. The
   * non-secret fields moved to {@link saveSettings}.
   *
   * A no-op when the field is empty — see {@link canSaveKey}.
   */
  saveKey: () => Promise<void>;
  /**
   * Explicit save, called ONLY from a "Save settings" button press. Writes
   * protocol/providerId/baseUrl/model/maxTokens and NEVER an `apiKey` property — not even an empty
   * string, which the server rejects (400) and which is precisely the write the old overloaded
   * control could make.
   *
   * ## Why this is not a second writer for the ledger's values
   *
   * The same protocol/baseUrl/model the operator edits here ALSO live in the `core.execution`
   * settings ledger, written on their own debounced path by `use-admin-execution-mode.hooks.ts`'s
   * `useSettingsSlice`. Two stores, deliberately (see `execution-settings.ts`'s
   * `loadAdminExecutionCredential` doc): the ledger holds the live values this browser's form shows,
   * while the credential ROW holds a snapshot the SERVER reads when a browser sends no credential of
   * its own — `byok-credential.ts`'s `createStoredExecutionCredentialPort`, which treats a row with
   * no `model` as unusable.
   *
   * Before the split, that snapshot was refreshed as a side effect of every key save. With
   * {@link saveKey} narrowed to the key, this button is the ONLY thing that writes it. Each of the
   * two stores still has exactly one writer; what changed is that the credential row's writer is now
   * a control the operator can see and press, rather than a hidden passenger on a different button.
   */
  saveSettings: () => Promise<void>;
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
export function useAdminExecutionCredential(
  { byok, onByokChange }: UseAdminExecutionCredentialInput,
  port: AdminExecutionCredentialPort,
): AdminExecutionCredentialController {
  const [stored, setStored] = useState<AdminExecutionCredential | null>(null);
  const [saveState, setSaveState] = useState<AdminByokSaveState>({ status: "idle" });
  const [settingsSaveState, setSettingsSaveState] = useState<AdminByokSaveState>({ status: "idle" });
  const [legacyKey, setLegacyKey] = useState<string | null>(null);
  const [legacyDismissed, setLegacyDismissed] = useState(false);

  // The operator's latest `byok`/`onByokChange`, read back by `saveKey` AFTER its await — never the
  // `byok` its own closure captured at button-press time. Without this, a provider chip click, a
  // model edit, or a newly typed key made while a key save was in flight was reverted to the
  // click-time config the instant the response landed, and the ledger slice then autosaved that
  // revert (S1). Assigning a ref during render is the same idiom `use-visitor-credential-
  // form.hooks.ts`'s `apiRef` uses for the identical reason.
  const inputRef = useRef<UseAdminExecutionCredentialInput>({ byok, onByokChange });
  inputRef.current = { byok, onByokChange };

  // The server rebuilds every write from the row it read when the request arrived
  // (`execution-credential-store.ts`'s `setExecutionCredential`: read -> seal -> upsert the WHOLE
  // merged record), so a key save, a settings save and a migration in flight together each merge
  // over the same stale row and the later upsert reverts the other's fields — both still answer
  // 200. Chained, each write reads what the one before it actually wrote. Tab-local only: two tabs,
  // or the Settings and AI Assistant mounts in two different browser windows, can still race — that
  // needs a server-side concurrency check (see the plan's "Needs owner decision" section). Same
  // shape as `use-visitor-credential-form.hooks.ts`'s `writeChainRef` (`8ac256353`) and
  // `use-other-credentials.hooks.ts`'s `serialized`.
  const writes = useSerialWrites();

  // Hydrate the stored view, on mount AND whenever another mount (or `AssistantDock`'s own separate
  // copy) publishes a change to this same server row — see this file's "Cross-mount staleness" doc
  // above. Silent on failure, same posture `use-visitor-credential-form.hooks.ts` takes for its own
  // GET: a failed read must not put an error next to a key field the operator has not touched yet,
  // and the only visible consequence is that the "already stored" affordances stay at whatever they
  // last held until a refresh works.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      port
        .loadAdminExecutionCredential()
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
    // `port` is referentially stable in production (`useWiredAdminExecutionCredential` always passes
    // the same module-level singleton), so adding it changes nothing about when this effect re-runs —
    // it is here only because it is now a function-scoped value ESLint's exhaustive-deps rule can see,
    // where the old `loadAdminExecutionCredential` import was invisible to that rule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  // Offer the migration prompt only once the server's own state is known AND nothing is already
  // stored there — an admin who already has a server-side credential (migrated earlier, or just
  // saved fresh this session) gets no benefit from being asked to migrate a now-superseded local
  // value, and re-asking would read as the screen not noticing its own save.
  useEffect(() => {
    if (stored === null) return;
    setLegacyKey(stored.isSet ? null : readLegacyLocalCredential());
  }, [stored]);

  function saveKey(): Promise<void> {
    const apiKey = byok.apiKey.trim();
    // The BUTTON's rule, applied again here so a blank field cannot reach the server even through a
    // direct call. Deliberately NOT `hasUsableAdminKey`: a stored key makes the credential usable,
    // not the empty field writable. See `hasTypedAdminKey`'s own doc for the bug that distinction fixes.
    // OUTSIDE the write chain on purpose: a no-op call must never queue a link that would only hold
    // up the migrate/settings writes behind it for nothing.
    if (!hasTypedAdminKey(apiKey)) return Promise.resolve(); // nothing typed — there is no key to write
    // Set synchronously, at call time, so a press queued behind another write shows "Saving…"
    // immediately rather than sitting at "idle" until its turn on the chain arrives.
    setSaveState({ status: "saving" });
    return writes.run(async () => {
      try {
        // The key ALONE. Every other field is `saveSettings`'s, and building the patch from one
        // literal (rather than spreading `byok` and deleting) is what makes that readable at a glance
        // — there is no branch here that could let another field through.
        const patch: AdminExecutionCredentialPatch = { apiKey };
        const view = await port.saveAdminExecutionCredential(patch);
        setStored(view);
        setSaveState({ status: "saved" });
        // Tells every other mounted copy of this credential (the other settings screen, the dock) to
        // re-read — see this file's "Cross-mount staleness" doc above.
        publishSettingsRefresh([EXECUTION_NAMESPACE]);
        // Clear the field once the key is safely stored — see this file's `onByokChange` doc. Reads
        // the LATEST input, not the `byok`/`onByokChange` this closure captured at button-press time
        // (S1 above), and only actually clears when the field still holds exactly the key that was
        // just saved — otherwise the operator has since typed something new, and clearing it would
        // discard that unsaved edit instead of the key this save actually persisted.
        const latestInput = inputRef.current;
        if (latestInput.byok.apiKey.trim() === apiKey) {
          latestInput.onByokChange({ ...latestInput.byok, apiKey: "" });
        }
      } catch (error) {
        setSaveState({ status: "error", message: describeAdminExecutionCredentialError(error, "failed to save the key") });
      }
    });
  }

  function saveSettings(): Promise<void> {
    setSettingsSaveState({ status: "saving" });
    return writes.run(async () => {
      try {
        // No `apiKey` key at all, under any condition — see this controller's `saveSettings` doc. The
        // field's contents are not consulted here, so there is no state of the form in which this
        // patch can grow one.
        const patch: AdminExecutionCredentialPatch = {
          protocol: byok.protocol,
          providerId: byok.providerId,
          baseUrl: byok.baseUrl,
          model: byok.model,
          ...(byok.maxTokens !== undefined ? { maxTokens: byok.maxTokens } : {}),
        };
        const view = await port.saveAdminExecutionCredential(patch);
        setStored(view);
        setSettingsSaveState({ status: "saved" });
        publishSettingsRefresh([EXECUTION_NAMESPACE]);
      } catch (error) {
        setSettingsSaveState({
          status: "error",
          message: describeAdminExecutionCredentialError(error, "failed to save the settings"),
        });
      }
    });
  }

  function migrateLegacyKey(): Promise<void> {
    if (!legacyKey) return Promise.resolve();
    setSaveState({ status: "saving" });
    return writes.run(async () => {
      try {
        const patch: AdminExecutionCredentialPatch = {
          apiKey: legacyKey,
          protocol: byok.protocol,
          providerId: byok.providerId,
          baseUrl: byok.baseUrl,
          model: byok.model,
          ...(byok.maxTokens !== undefined ? { maxTokens: byok.maxTokens } : {}),
        };
        const view = await port.saveAdminExecutionCredential(patch);
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
    });
  }

  function dismissLegacyPrompt(): void {
    setLegacyDismissed(true);
  }

  // All three read the form's CURRENT endpoint, so they follow a provider switch on the same render.
  const storedKeyIsForOtherEndpoint = storedKeyIsForOtherEndpointRule(stored, byok.baseUrl);
  return {
    stored,
    apiKeyStoredExternally: hasUsableKey(byok.apiKey, stored, byok.baseUrl),
    apiKeyPlaceholder: resolveByokApiKeyPlaceholder(stored, storedKeyIsForOtherEndpoint),
    storedKeyIsForOtherEndpoint,
    canDiscoverModels: !storedKeyBlocksProbe(byok.apiKey, stored, byok.baseUrl),
    saveState,
    settingsSaveState,
    canSaveKey: hasTypedAdminKey(byok.apiKey),
    saveKey,
    saveSettings,
    legacyKey: legacyDismissed ? null : legacyKey,
    migrateLegacyKey,
    dismissLegacyPrompt,
  };
}

/**
 * Binds the real `loadAdminExecutionCredential`/`saveAdminExecutionCredential` — see
 * `admin-execution-credential-dependencies.hooks.ts`.
 *
 * The zero-argument-port half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `SettingsUi.tsx`/`AiAssistant.tsx` compose this and a test composes {@link useAdminExecutionCredential}
 * with `createFakeAdminExecutionCredentialPort`.
 */
export function useWiredAdminExecutionCredential(
  input: UseAdminExecutionCredentialInput,
): AdminExecutionCredentialController {
  return useAdminExecutionCredential(input, defaultAdminExecutionCredentialPort);
}
