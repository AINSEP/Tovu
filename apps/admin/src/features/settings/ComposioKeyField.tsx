import { useState } from "react";

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
 */
export interface ComposioKeyFieldProps {
  composio: ComposioConfigController;
}

export function ComposioKeyField({ composio }: ComposioKeyFieldProps) {
  const [draft, setDraft] = useState("");
  const configured = composio.config?.configured ?? false;
  const busy = composio.saveState === "saving";

  const onSave = async () => {
    const apiKey = draft.trim();
    if (!apiKey) return;
    await composio.save(apiKey);
    // Cleared unconditionally rather than only on success: the value is a secret, and a failed
    // save is not a reason to leave it sitting in the DOM. The operator re-pastes on retry.
    setDraft("");
  };

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
          placeholder={configured ? "Replace saved key" : "comp_..."}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void onSave();
          }}
        />
        <button
          type="button"
          className="settings-ui-dialog-btn"
          disabled={busy || draft.trim().length === 0}
          onClick={() => void onSave()}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {configured ? (
          <button
            type="button"
            className="settings-ui-dialog-btn"
            disabled={busy}
            onClick={() => void composio.clear()}
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
