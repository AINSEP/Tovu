import { agentHandle, buildAgentListHandles } from "@jini-ai/core/agent-handles";
import { interpolate, type Translate } from "@jini-ai/core/text";
import { ConfirmDialog } from "@jini-ai/admin/react";
import { Toast } from "@jini-ai/ui";
import { ErrorNotice } from "@jini-ai/ui/panel-kit";

import type { ChosenThemeHeldBack, HeldBackTheme } from "./api/held-back-themes-api";
import type { HeldBackFailure } from "./held-back-themes-failure";
import { IDLE_ROW, type HeldBackRowState, type HeldBackThemesController } from "./hooks/use-held-back-themes.hooks";
import { themeDisplayName } from "./rules";
import "./held-back-themes.css";

/**
 * @file The "Held back on import" section of the Themes screen (A452) and the notice that points at it
 * — markup only; state and round trips live in `hooks/use-held-back-themes.hooks.ts`.
 */

/**
 * `bytes` for the row's meta line: KB below 1 MB (one decimal under 10), else MB.
 * @complexity O(1).
 */
function formatSize({ bytes }: { bytes: number }, _optional = {}): string {
  const kb = bytes / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
}

/** What a row's live region says, or `null` when there is nothing to say yet. */
type RowResult =
  | { kind: "ok"; message: string }
  | { kind: "problem"; message: string; problems: string[]; report: HeldBackFailure["report"] };

/**
 * Derives the row's single result line from its state: a refusal wins over the check it staled, then a
 * failed check, then a name clash, then a pass.
 * @complexity O(problems).
 */
function rowResult({ row, t }: { row: HeldBackRowState; t: Translate }, _optional = {}): RowResult | null {
  const { failure, check } = row;
  if (failure) return { kind: "problem", message: failure.message, problems: failure.problems, report: failure.report };
  if (!check) return null;
  if (!check.passes) return { kind: "problem", message: t("Still fails the safety checks, so it stays held back:"), problems: check.problems, report: null };
  if (check.nameTaken) return { kind: "problem", message: t("A theme with this name is already installed, so this one can't be restored."), problems: [], report: null };
  return { kind: "ok", message: t("Passed the safety checks. You can restore it.") };
}

/** The result's content: one line (or the incident notice), then the problem list when there is one. */
function RowResultBody({ result, t }: { result: RowResult | null; t: Translate }) {
  if (!result) return null;
  if (result.kind === "ok") return <p className="held-back-ok">{result.message}</p>;
  return (
    <>
      {result.report ? <ErrorNotice failure={result.report} disclosure="id-only" t={t} role="status" /> : <p>{result.message}</p>}
      {result.problems.length > 0 ? <ul>{result.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : null}
    </>
  );
}

/** The row's result, inside a polite live region that is always mounted so a screen reader hears each change. */
function RowResultRegion({ result, t }: { result: RowResult | null; t: Translate }) {
  return (
    <div className="held-back-row__result" role="status" aria-live="polite">
      <RowResultBody result={result} t={t} />
    </div>
  );
}

/** The Check button's verb: busy, "again" once there is anything to re-check, else the first Check. */
function checkButtonLabel({ row, t }: { row: HeldBackRowState; t: Translate }, _optional = {}): string {
  if (row.phase === "checking") return t("Checking…");
  return row.check || row.failure ? t("Check again") : t("Check");
}

/**
 * Check and Restore… for one row. Restore… appears only after a passing check (its digest is what the
 * approval sends), and is disabled with the reason shown when the name is taken. Names go in the
 * accessible label because every row repeats the same verbs.
 */
function RowActions({ theme, row, handle, controller, t }: { theme: HeldBackTheme; row: HeldBackRowState; handle: string; controller: HeldBackThemesController; t: Translate }) {
  const checking = row.phase === "checking";
  const restoring = row.phase === "restoring";
  const checkLabel = checkButtonLabel({ row, t });
  const restoreLabel = restoring ? t("Restoring…") : t("Restore…");
  return (
    <div className="held-back-row__actions">
      <button
        type="button"
        className="btn-secondary"
        disabled={checking || restoring}
        aria-busy={checking}
        aria-label={`${checkLabel} ${theme.name}`}
        onClick={() => void controller.check({ themeId: theme.id })}
        {...agentHandle({ handle: `${handle}-check` }, { role: "button", label: `Re-check the held-back "${theme.id}" theme` })}
      >
        {checkLabel}
      </button>
      {row.check?.passes ? (
        <button
          type="button"
          className="btn-primary"
          disabled={restoring || row.check.nameTaken}
          aria-busy={restoring}
          aria-label={`${restoreLabel} ${theme.name}`}
          onClick={() => void controller.requestRestore({ themeId: theme.id })}
          {...agentHandle({ handle: `${handle}-restore` }, { role: "button", label: `Restore the held-back "${theme.id}" theme (asks for approval)` })}
        >
          {restoreLabel}
        </button>
      ) : null}
    </div>
  );
}

/** "1 file, 0.3 KB" — the singular has its own key so every language can inflect it. */
function filesAndSize({ theme, t }: { theme: HeldBackTheme; t: Translate }, _optional = {}): string {
  const vars = { files: theme.files, size: formatSize({ bytes: theme.bytes }) };
  return interpolate({ template: t(theme.files === 1 ? "1 file, {size}" : "{files} files, {size}"), vars });
}

/** One held-back theme: what it is, the last check's answer, and its actions. */
function HeldBackRow({ theme, row, handle, controller, t }: { theme: HeldBackTheme; row: HeldBackRowState; handle: string; controller: HeldBackThemesController; t: Translate }) {
  const meta = [t(theme.tier === "static" ? "Static" : "Declarative"), theme.original ? t("From your original themes") : null, filesAndSize({ theme, t })];
  return (
    <li className="card held-back-row">
      <div className="held-back-row__main">
        <h3 className="held-back-row__name">{theme.name}</h3>
        <p className="held-back-row__meta">{meta.filter(Boolean).join(" · ")}</p>
        <RowResultRegion result={rowResult({ row, t })} t={t} />
      </div>
      <RowActions theme={theme} row={row} handle={handle} controller={controller} t={t} />
    </li>
  );
}

/** The list body: loading line, list failure with Retry, or the rows. */
function HeldBackBody({ controller, t }: { controller: HeldBackThemesController; t: Translate }) {
  if (controller.status === "loading") return <p className="held-back-themes__loading" role="status">{t("Loading held-back themes…")}</p>;
  if (controller.status === "error" && controller.listFailure) {
    const { listFailure } = controller;
    return (
      <>
        {listFailure.report ? <ErrorNotice failure={listFailure.report} disclosure="id-only" t={t} /> : <div className="notice error" role="alert">{listFailure.message}</div>}
        <button type="button" className="btn-secondary held-back-themes__retry" onClick={() => void controller.retry()}>{t("Retry")}</button>
      </>
    );
  }
  const handles = buildAgentListHandles({ prefix: "themes-held-back", ids: controller.themes.map((theme) => theme.id) });
  return (
    <>
      <p className="held-back-themes__intro">{t("These themes did not pass the safety checks when your site was imported, so they were set aside instead of going live. Nothing was deleted. Check a theme again, and restore it if you trust it.")}</p>
      <ul className="held-back-list">
        {controller.themes.map((theme, index) => (
          <HeldBackRow key={theme.id} theme={theme} row={controller.rows[theme.id] ?? IDLE_ROW} handle={handles[index]!} controller={controller} t={t} />
        ))}
      </ul>
    </>
  );
}

/**
 * The "Held back on import" section, below the theme grid. Not rendered at all when the owner has
 * nothing held back (or may not see it): most sites never import a bad theme, and an empty heading
 * with "none" under it would be permanent clutter on every visit. The success toast lives outside the
 * section so restoring the LAST theme still confirms it after the section has emptied itself.
 */
export function HeldBackThemes({ controller, t }: { controller: HeldBackThemesController; t: Translate }) {
  const visible = controller.status === "loading" || controller.status === "error" || (controller.status === "ready" && controller.themes.length > 0);
  return (
    <>
      {visible ? (
        <section className="held-back-themes" aria-labelledby="held-back-themes-heading">
          <h2 id="held-back-themes-heading" className="section-title">{t("Held back on import")}</h2>
          <HeldBackBody controller={controller} t={t} />
          {/* Inside the section: a closed dialog is still an element, and the section is the only place it can open from. */}
          <ConfirmDialog {...controller.dialog} agentHandle="themes-restore-held-back" />
        </section>
      ) : null}
      {controller.restoredNotice ? <Toast message={controller.restoredNotice} role="status" tone="success" ttlMs={5000} onDismiss={controller.dismissRestoredNotice} /> : null}
    </>
  );
}

/**
 * Warning at the top of the screen when the site's CHOSEN theme was held back on import, so visitors
 * see the default theme instead. `.notice.warning` like the stranded-theme banner: the owner needs to
 * know, nothing was lost. Gone as soon as the theme is restored or another one is chosen (the server
 * stops reporting it).
 */
export function HeldBackChosenThemeNotice({ chosenThemeHeldBack, themeNames, t }: { chosenThemeHeldBack: ChosenThemeHeldBack | null; themeNames: Record<string, string>; t: Translate }) {
  if (!chosenThemeHeldBack) return null;
  const fallback = themeDisplayName({ themeId: chosenThemeHeldBack.fallbackThemeId, themeNames });
  return (
    <div className="notice warning">
      {interpolate({
        template: t("Your site's chosen theme “{name}” was held back on import, so visitors see the default theme “{fallback}”. Check it under Held back on import below and restore it if you trust it."),
        vars: { name: chosenThemeHeldBack.name, fallback },
      })}
    </div>
  );
}
