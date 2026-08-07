import type { AdminByokSaveState, AdminExecutionCredentialController } from "../hooks/use-admin-execution-credential.hooks";

/**
 * @file The two small pieces `SettingsUi.tsx`'s Execution tab and `AiAssistant.tsx`'s
 * `AdminExecutionMode` both mount around `ExecutionTab` for the admin's own BYOK credential — the
 * migration banner and the "Save key" footer. Presentational only; all state and API calls live in
 * `hooks/use-admin-execution-credential.hooks.ts`, shared by both callers so the two mounts render
 * (and behave) identically rather than drifting — see that hook's own file doc for why one shared
 * implementation matters here specifically.
 *
 * `AdminByokKeyFooter`'s output is meant for `ExecutionTab`'s `apiKeyFooter` prop; `AdminByokMigrationPrompt`
 * is a sibling of `<ExecutionTab>`, not a child of it — it has to render regardless of whether BYOK
 * mode is even selected, since an admin might be sitting in Local CLI mode with a legacy key still
 * inert in this browser's `localStorage`.
 */

export interface AdminByokMigrationPromptProps {
  controller: AdminExecutionCredentialController;
}

/**
 * The one-time "we found a saved key in this browser — save it to your account?" prompt (owner-
 * approved rollout, design doc §6). Renders nothing once `controller.legacyKey` is `null` —
 * migrated, declined this session, or there was never a local key to find.
 *
 * @complexity Time/space: O(1) — fixed markup, no iteration.
 * @overallScore 100
 */
export function AdminByokMigrationPrompt({ controller }: AdminByokMigrationPromptProps) {
  if (!controller.legacyKey) return null;
  const saving = controller.saveState.status === "saving";

  return (
    <div className="notice admin-byok-migration" role="status">
      <p>
        We found a saved key in this browser — save it to your account? It will be encrypted and stored on the
        server, and this browser&rsquo;s copy will be cleared once that succeeds. Declining leaves it exactly as it
        is; nothing is sent or cleared unless you confirm.
      </p>
      <div className="admin-byok-migration-actions">
        <button type="button" className="btn-primary" onClick={() => void controller.migrateLegacyKey()} disabled={saving}>
          {saving ? "Saving…" : "Save to my account"}
        </button>
        <button type="button" className="btn-secondary" onClick={controller.dismissLegacyPrompt} disabled={saving}>
          Not now
        </button>
      </div>
      {controller.saveState.status === "error" ? <div className="save-error">{controller.saveState.message}</div> : null}
    </div>
  );
}

export interface AdminByokKeyFooterProps {
  controller: AdminExecutionCredentialController;
}

/**
 * The footer's status line, as a single string (or `null` to render nothing) — the four
 * mutually-exclusive `saveState.status` checks that used to sit directly in
 * `AdminByokKeyFooter`'s JSX, pulled out as a top-level pure function per this pass's extraction
 * rule (§2 of the complexity-ceiling brief). `isStored` takes the already-narrowed boolean rather
 * than the full `stored` record, so this function has no dependency on `AdminExecutionCredential`'s
 * shape beyond the one field it reads.
 */
export function resolveByokFooterStatusLine(status: AdminByokSaveState["status"], isStored: boolean): string | null {
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved to the server, encrypted.";
  if (status === "idle") return isStored ? "Stored on the server, encrypted. Paste a new key to replace it." : "Paste your key, then press Save key.";
  return null;
}

/**
 * The explicit "Save key" control and its status line — the ONLY control on either screen that
 * writes the admin's own credential. Meant for `ExecutionTab`'s `apiKeyFooter` slot, directly under
 * the API-key field.
 *
 * @complexity Time/space: O(1).
 * @overallScore 100
 */
export function AdminByokKeyFooter({ controller }: AdminByokKeyFooterProps) {
  const { saveState, canSaveKey, stored } = controller;
  const saving = saveState.status === "saving";
  const statusLine = resolveByokFooterStatusLine(saveState.status, stored?.isSet ?? false);

  return (
    <div className="assistant-key-footer">
      <div className="assistant-key-actions">
        {/* Disabled until there is something meaningful to write — a typed key, or (for a
            protocol/model-only change) an already-stored one. Never fires automatically; see the
            hook's own doc for why this is the ONLY path that can persist the key. */}
        <button type="button" className="btn-primary" onClick={() => void controller.saveKey()} disabled={!canSaveKey || saving}>
          {saving ? "Saving…" : "Save key"}
        </button>
      </div>
      <p className="assistant-save-line">{statusLine}</p>
      {saveState.status === "error" ? <div className="save-error">{saveState.message}</div> : null}
    </div>
  );
}
