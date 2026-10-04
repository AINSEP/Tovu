import { AGENT_PRIVATE_ATTRIBUTE, agentHandle } from "@jini-ai/agentic";

import { START_FRESH_CONFIRMATION, type SiteTokenRecoveryController } from "./hooks/use-site-token-recovery.hooks";

/**
 * @file The Site Token tab's recovery card for a locked site: "Paste your old token" and "Start
 * fresh" (one typed confirmation). Render only — state, copy and requests live in
 * `hooks/use-site-token-recovery.hooks.ts`.
 *
 * The token field is a password field marked agent-private, so the assistant can never read a
 * pasted key. The final Start fresh button has no agent handle: it removes saved credentials, so a
 * person confirms it.
 */
export function SiteTokenRecoveryCard({ recovery }: { recovery: SiteTokenRecoveryController }) {
  const translate = recovery.t;
  return (
    <section className="card site-token-recovery-card" {...agentHandle({ handle: "security-site-token-recovery" }, { role: "region", label: "Unlock saved credentials locked with a different Site Token" })}>
      <h3 className="site-token-status-heading">{translate("Your saved credentials are locked")}</h3>
      {recovery.resultMessage ? (
        <p className="notice" role="status">{recovery.resultMessage}</p>
      ) : (
        <>
          <p className="site-token-status-note">{translate("They were locked with a site token that isn't on this computer.")}</p>
          <SiteTokenUnlockForm recovery={recovery} />
          <SiteTokenStartFresh recovery={recovery} />
        </>
      )}
    </section>
  );
}

function SiteTokenUnlockForm({ recovery }: { recovery: SiteTokenRecoveryController }) {
  const translate = recovery.t;
  return (
    <form
      className="site-token-recovery-unlock"
      onSubmit={(event) => {
        event.preventDefault();
        void recovery.unlock();
      }}
    >
      <label htmlFor="site-token-recovery-token">{translate("Paste your old token")}</label>
      <div className="site-token-recovery-row">
        <input
          id="site-token-recovery-token"
          type="password"
          // Chrome ignores "off" on a password field and offers a saved login password here; this is
          // a pasted secret, never a sign-in, so it uses "new-password" like every other secret field.
          autoComplete="new-password"
          spellCheck={false}
          placeholder={translate("64 characters, 0-9 and a-f")}
          value={recovery.token}
          onChange={(event) => recovery.setToken(event.target.value)}
          {...{ [AGENT_PRIVATE_ATTRIBUTE]: "" }}
        />
        <button type="submit" className="btn-primary" disabled={recovery.unlocking || recovery.token.trim() === ""}>
          {recovery.unlocking ? translate("Unlocking…") : translate("Unlock")}
        </button>
      </div>
      {recovery.unlockError ? <p className="notice error" role="status">{recovery.unlockError}</p> : null}
    </form>
  );
}

function SiteTokenStartFresh({ recovery }: { recovery: SiteTokenRecoveryController }) {
  const translate = recovery.t;
  if (recovery.startFreshStep === "closed") {
    return (
      <div className="site-token-recovery-start-fresh">
        <p className="jini-field-hint">{translate("Lost it? A restore point is saved first, then only the credentials that can't be unlocked are removed.")}</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void recovery.openStartFresh()}
          {...agentHandle({ handle: "security-site-token-start-fresh-open" }, { role: "button", label: "Show what starting fresh would remove" })}
        >
          {translate("Start fresh…")}
        </button>
      </div>
    );
  }
  if (recovery.startFreshStep === "loading") return <p className="site-token-loading">{translate("Checking what would change…")}</p>;
  return (
    <div className="site-token-recovery-start-fresh site-token-recovery-confirm">
      {recovery.preview ? <p>{recovery.preview.detail}</p> : null}
      <label htmlFor="site-token-recovery-confirm">{translate("Type START FRESH to confirm")}</label>
      <div className="site-token-recovery-row">
        <input
          id="site-token-recovery-confirm"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={START_FRESH_CONFIRMATION}
          value={recovery.confirmText}
          onChange={(event) => recovery.setConfirmText(event.target.value)}
        />
        <button type="button" className="btn-danger" disabled={!recovery.canConfirmStartFresh} onClick={() => void recovery.startFresh()}>
          {recovery.startingFresh ? translate("Starting fresh…") : translate("Start fresh")}
        </button>
        <button type="button" className="btn-ghost" onClick={recovery.cancelStartFresh} {...agentHandle({ handle: "security-site-token-start-fresh-cancel" }, { role: "button", label: "Cancel starting fresh" })}>
          {translate("Cancel")}
        </button>
      </div>
      {recovery.startFreshError ? <p className="notice error" role="status">{recovery.startFreshError}</p> : null}
    </div>
  );
}
