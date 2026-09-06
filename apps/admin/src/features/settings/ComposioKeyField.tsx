import { agentHandle } from "@jini-ai/agentic";
import { useComposioKeyField } from "./hooks/use-composio-key-field.hooks";
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
   *  {@link useComposioKeyField}; a test can pass a fake here to exercise `ComposioKeyField`'s
   *  rendering with a fixed draft/configured/busy state. */
  useKeyField?: typeof useComposioKeyField;
}

/**
 * Resolves `useKeyField` to the real hook when a caller passes none — same `??`-avoidance idiom
 * `MenuEditor.tsx`'s `orEmpty`/`AssistantDock.tsx`'s/`App.tsx`'s resolver groups use (2026-08-14,
 * DI migration sweep's complexity follow-up): ESLint's cyclomatic-complexity rule counts a default
 * parameter value inside a function's OWN body as one of that function's own branches — a call out
 * to a separately-scoped resolver does not.
 */
function resolveKeyFieldHook(override: typeof useComposioKeyField | undefined): typeof useComposioKeyField {
  return override ?? useComposioKeyField;
}

export function ComposioKeyField({ composio, useKeyField: useKeyFieldProp }: ComposioKeyFieldProps) {
  const useKeyField = resolveKeyFieldHook(useKeyFieldProp);
  const { draft, setDraft, configured, busy, placeholder, onSave } = useKeyField(composio);

  return (
    <div className="composio-key-field">
      <label className="composio-key-label" htmlFor="composio-api-key">
        Composio API key
      </label>
      <p className="composio-key-help">
        {configured ? (
          <>
            A key ending in <code>{composio.config?.apiKeyTail}</code> is saved. Paste a new one to
            replace it.
          </>
        ) : (
          <>Save a Composio API key to load the live connector catalog and connect accounts.</>
        )}
      </p>
      <div className="composio-key-row">
        <input
          id="composio-api-key"
          className="composio-key-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
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
          {busy ? "Saving…" : "Save"}
        </button>
        {configured ? (
          <button
            type="button"
            className="settings-ui-dialog-btn"
            disabled={busy}
            onClick={() => void composio.clear()}
            {...agentHandle("settings-composio-key-clear", { role: "button", label: "Clear the saved Composio API key" })}
          >
            Clear
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
