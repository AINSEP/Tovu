import { agentHandle } from "@jini-ai/agentic";
import { splitOnPlaceholders } from "../../lib/template-i18n";
import type { Translate } from "../../lib/dictionary-translator";
import { useWiredComposioKeyField } from "./hooks/use-composio-key-field.hooks";
import type { ComposioConfigController } from "./hooks/use-composio-config.hooks";

/**
 * @file The Composio API key field above the Connectors grid.
 *
 * Tovu's own chrome, not a `@jini-ai/ui` component: `ConnectorsBrowser` has never had a key input.
 * Open Design's equivalent field lived in that product's page chrome, which is why the Connectors
 * tab's gate copy used to point at a field Tovu did not render (see `SettingsUi.tsx`'s note). This
 * is that missing field.
 *
 * Write-only, like every other credential surface here: a stored key comes back as
 * `configured` + a 4-character tail and is never rendered into the input.
 *
 * The draft-input state lives in `hooks/use-composio-key-field.hooks.ts`, split out the same way
 * `SeeMore`/`SeeMore.hooks.tsx` does — this file stays props-and-JSX only, and the `useKeyField`
 * prop below lets a test render this JSX against a fake hook.
 */
export interface ComposioKeyFieldProps {
  composio: ComposioConfigController;
  /** Injectable seam for the draft-input state. Defaults to the real
   *  {@link useWiredComposioKeyField}; a test can pass a fake here to exercise `ComposioKeyField`'s
   *  rendering with a fixed draft/configured/busy/`t` state. */
  useKeyField?: typeof useWiredComposioKeyField;
}

/**
 * Resolves `useKeyField` to the real wired hook when a caller passes none — same `??`-avoidance
 * idiom `MenuEditor.tsx`'s `orEmpty`/`AssistantDock.tsx`'s/`App.tsx`'s resolver groups use
 * (2026-08-14, DI migration sweep's complexity follow-up): ESLint's cyclomatic-complexity rule
 * counts a default parameter value inside a function's OWN body as one of that function's own
 * branches — a call out to a separately-scoped resolver does not.
 */
function resolveKeyFieldHook(override: typeof useWiredComposioKeyField | undefined): typeof useWiredComposioKeyField {
  return override ?? useWiredComposioKeyField;
}

/** The configured-state help sentence, with the saved key's tail as a real `<code>` node —
 *  `splitOnPlaceholders` keeps it a genuine inline element rather than baking it into translated
 *  text, the same technique `ThemeExplore.tsx` already uses for an inline `<code>` node inside
 *  translated copy. Split out purely so `ComposioKeyField` itself doesn't also carry this call's
 *  own three-piece destructure. @complexity O(1). */
function ComposioKeyConfiguredHelp({ t, tail }: { t: Translate; tail: string }) {
  const [before, after] = splitOnPlaceholders(t("A key ending in {tail} is saved. Paste a new one to replace it."), ["{tail}"]);
  return (
    <>
      {before}
      <code>{tail}</code>
      {after}
    </>
  );
}

export function ComposioKeyField({ composio, useKeyField: useKeyFieldProp }: ComposioKeyFieldProps) {
  const useKeyField = resolveKeyFieldHook(useKeyFieldProp);
  const { draft, setDraft, configured, busy, placeholder, onSave, t } = useKeyField(composio);

  return (
    <div className="composio-key-field">
      <label className="composio-key-label" htmlFor="composio-api-key">
        {t("Composio API key")}
      </label>
      <p className="composio-key-help">
        {configured ? (
          <ComposioKeyConfiguredHelp t={t} tail={composio.config?.apiKeyTail ?? ""} />
        ) : (
          <>{t("Save a Composio API key to load the live connector catalog and connect accounts.")}</>
        )}
      </p>
      <div className="composio-key-row">
        {/* `autoComplete="new-password"`, NOT `"off"` — Chrome deliberately ignores `off` on
            credential-shaped fields (a long-standing intentional decision, not a bug); `off` is
            what let Chrome's saved-password manager silently prefill this field with a saved
            login password, so the vendor rejected a key the owner never typed and she debugged
            her real key for nothing. `new-password` is the documented signal that suppresses
            both the saved-credential dropdown and the silent fill (matching this repo's own
            corrected precedent on `users/Users.tsx` and `security/AccessTokensTab.tsx`, commit
            `fc64f2d9`). */}
        <input
          id="composio-api-key"
          className="composio-key-input"
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          placeholder={t(placeholder)}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void onSave();
          }}
          {...agentHandle("settings-composio-key", { role: "field", label: "Composio API key" })}
        />
        <button
          type="button"
          className="settings-ui-dialog-btn"
          disabled={busy || draft.trim().length === 0}
          onClick={() => void onSave()}
          {...agentHandle("settings-composio-key-save", { role: "button", label: "Save the Composio API key" })}
        >
          {busy ? t("Saving…") : t("Save")}
        </button>
        {configured ? (
          <button
            type="button"
            className="settings-ui-dialog-btn"
            disabled={busy}
            onClick={() => void composio.clear()}
            {...agentHandle("settings-composio-key-clear", { role: "button", label: "Clear the saved Composio API key" })}
          >
            {t("Clear")}
          </button>
        ) : null}
      </div>
      {composio.saveState === "error" && composio.saveError !== null ? (
        <p className="settings-ui-save is-error" role="alert">
          {composio.saveError}
        </p>
      ) : null}
      {composio.loadError !== null ? (
        <p className="settings-ui-save is-error" role="alert">
          {composio.loadError}
        </p>
      ) : null}
    </div>
  );
}
