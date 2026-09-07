import type { Translate } from "@/lib/dictionary-translator";
import { interpolate } from "@/lib/template-i18n";

import type { AdmissionDriftConnection, AdmissionDriftEntry } from "./external-mcp-admissions-rules";
import type { ExternalMcpAdmissionsController } from "./hooks/use-external-mcp-admissions.hooks";

/**
 * @file "What the assistant is actually running" — the operator half of the refusal channel.
 *
 * The tab above this banner shows what was SAVED. `mcp-federation/trust.ts` R5 freezes the admitted
 * set at connect, so those are two different objects, and until now the only way to see the gap was
 * to read the daemon's terminal at the moment it booted. That is how this project discovered
 * Higgsfield's blocked `generate_image` in the first place — and on a desktop app nobody can SSH
 * into, a terminal is not a support channel.
 *
 * Renders NOTHING when the live assistant and the saved roster agree, which is the normal state. A
 * banner that is always present is a banner nobody reads.
 *
 * All display decisions live in `external-mcp-admissions-rules.ts` and the hook beside it; this
 * file only maps already-decided rows onto elements. The copy strings are their own i18n keys
 * (`dictionary-translator.ts`) and are passed through `t` verbatim — six of them were written and
 * translated into 21 locales in Phase 2C for exactly this UI and have never been rendered.
 */

/** One row: what the assistant refused, and — for the one case an operator can fix from here —
 *  the tick that fixes it. A real `<label>`, not an `aria-label`: an icon-only or bare checkbox
 *  would have no accessible name at all, and `agentHandle`'s `label` does not supply one (it emits
 *  `data-agent-label`). The visible words also make the translated sentence beside it
 *  ("Tick 'may write' to enable this tool.") literally true rather than a reference to a control
 *  that is not there. */
function AdmissionDriftRow(props: { entry: AdmissionDriftEntry; t: Translate; onAllowWrite: (connectionId: string, remoteName: string) => void }) {
  const { entry, t, onAllowWrite } = props;
  const message = interpolate(t(entry.messageKey), entry.messageVars);

  return (
    <li className="external-mcp-drift-row">
      <code>{entry.remoteName}</code> — <span>{message}</span>
      {entry.kind === "needs-write-grant" ? (
        <label className="external-mcp-drift-grant">
          <input
            type="checkbox"
            checked={false}
            onChange={() => onAllowWrite(entry.connectionId, entry.remoteName)}
            data-agent-element={`mcp-drift-grant-${entry.connectionId}-${entry.remoteName}`}
          />
          <span>{t("may write")}</span>
        </label>
      ) : null}
    </li>
  );
}

/** One connection's saved-vs-live line plus its rows. The count line is only rendered when names
 *  are actually missing: "Live now: 5. Saved: 5." is noise, and the parameterized key is written
 *  around naming the absent ones. */
function AdmissionConnectionSection(props: {
  connection: AdmissionDriftConnection;
  t: Translate;
  onAllowWrite: (connectionId: string, remoteName: string) => void;
}) {
  const { connection, t, onAllowWrite } = props;

  return (
    <section className="external-mcp-drift-connection">
      <h4>{connection.connectionId}</h4>
      {connection.notLoaded.length > 0 ? (
        <p>
          {interpolate(t("Live now: {live} tools. Saved: {saved} tools — {names} are not loaded."), {
            live: connection.liveToolCount,
            saved: connection.savedToolCount,
            names: connection.notLoaded.join(", "),
          })}
        </p>
      ) : null}
      <ul>
        {connection.entries.map((entry) => (
          <AdmissionDriftRow key={`${entry.connectionId}:${entry.remoteName}:${entry.kind}`} entry={entry} t={t} onAllowWrite={onAllowWrite} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The restart footer. D-4: the restart route is `system.write`-gated while this tab is
 * `admin.integrations.manage`-gated, so an operator with integration rights and no system rights is
 * told who can do it instead of being handed a button that 403s on click.
 *
 * "Accepted", never "restarted": the route answers as soon as a restart is INITIATED and no "the
 * daemon became healthy" signal exists anywhere in this codebase (that route's own header). Saying
 * more than was actually learned is the failure mode this whole slice exists to close.
 */
function AdmissionRestartFooter(props: { controller: ExternalMcpAdmissionsController; t: Translate }) {
  const { controller, t } = props;

  if (!controller.canRestart) {
    return (
      <p className="external-mcp-drift-restart">
        {t("You don't have permission to restart the assistant. Ask someone who does to restart it so this change takes effect.")}
      </p>
    );
  }

  return (
    <p className="external-mcp-drift-restart">
      <button type="button" onClick={controller.restart} disabled={controller.restarting} data-agent-element="mcp-drift-restart">
        {t("Restart the assistant")}
      </button>{" "}
      <span>{t("This ends any conversation in progress.")}</span>
      {controller.restartError ? <span role="alert">{controller.restartError}</span> : null}
      {controller.restartAccepted ? <span role="status">{t("Restarting…")}</span> : null}
    </p>
  );
}

export interface ExternalMcpAdmissionsBannerProps {
  controller: ExternalMcpAdmissionsController;
  t: Translate;
  /** Ticks "may write" for one tool by writing the connection's `writeAllowedToolNames` field
   *  through the same `updateSource` port the card's own edit form uses. */
  onAllowWrite: (connectionId: string, remoteName: string) => void;
}

export function ExternalMcpAdmissionsBanner({ controller, t, onAllowWrite }: ExternalMcpAdmissionsBannerProps) {
  if (controller.loading) return null;

  if (controller.unavailable) {
    return (
      <div className="external-mcp-banner" role="status">
        {controller.unavailable}
      </div>
    );
  }

  if (controller.connections.length === 0) return null;

  return (
    // No `role` on the wrapper: this renders on load rather than in response to an action, so it is
    // ordinary content, and a live region wrapping the two live regions below (the restart refusal's
    // `alert` and its `status`) would make a screen reader announce the whole banner again on every
    // inner change.
    <div className="external-mcp-banner external-mcp-drift">
      <p>{t("Saved. The assistant is still running with its previous tool list.")}</p>
      {controller.connections.map((connection) => (
        <AdmissionConnectionSection key={connection.connectionId} connection={connection} t={t} onAllowWrite={onAllowWrite} />
      ))}
      <AdmissionRestartFooter controller={controller} t={t} />
    </div>
  );
}
