import type { ReactNode } from "react";
import { agentHandle } from "@jini-ai/agentic";

import type { Translate } from "../../lib/dictionary-translator";
import { resolveCreateInputDisabled, resolveCreateSubmitDisabled, resolveDatabaseOptionClassName } from "./Sites.hooks";
import type { useWiredSites } from "./hooks/use-sites.hooks";

/**
 * @file The "New site" tab — an onboarding questionnaire that creates a site folder.
 *
 * Replaces the create form that used to be a dashed tile INSIDE the site grid (owner verdict on
 * that: "This is just awful"). Her replacement, in her own words: "the new site should be a button
 * that says new site that takes you to maybe, like, an onboarding screen … the new site tab will
 * have the questionnaire of what the name will be, whether it's a SQLite or Supabase. If it's a
 * Supabase, they have to have an access token. And then I think for now, we always have a SQLite
 * for chats."
 *
 * ## Pacing: three questions, all visible at once — not a wizard
 *
 * The steps are numbered because they genuinely are a sequence (name the folder, pick its database,
 * make it), and a reader can see all three at once and know the flow is short. What this
 * deliberately is NOT is a next/back wizard: that would add per-step state and per-step validation
 * gating — new behavior with its own failure modes — to a form with three questions in it, and the
 * complaint about the old version was that the form was cramped, not that it was too long.
 *
 * ## The Supabase option, and why it cannot lie
 *
 * **Site creation cannot do Supabase or Postgres today, and this tab must not imply otherwise.**
 * Verified against the code rather than assumed: `initSite` (`apps/website/src/platform/site-dir/
 * init-site.ts`) calls `openContentDb(path.join(target, "content.db"), seed)` — SQLite, hardcoded,
 * with no dialect parameter anywhere in its input shape; the create route
 * (`server/inbound/admin-http/routes/system/sites.ts`) reads exactly one field off the request body
 * (`parseCreateSiteName`) and silently discards everything else; and `schema.postgres.ts`, though a
 * real generated Postgres schema, is referenced only by drift/parity tests and is wired into no
 * creation path at all. Supabase appears nowhere as a database backend — only as an MCP server
 * preset for the assistant, which is a different feature entirely.
 *
 * So the guarantee here is structural, not cosmetic. There is **no state variable that can hold a
 * dialect**: the SQLite radio is a fixed `checked`/`readOnly` control, the Supabase radio is
 * `disabled`, and {@link NewSiteTab}'s submit handler calls `createSite()` — a zero-argument
 * function whose signature has nowhere to put a choice. Forcing the Supabase radio on in the DOM
 * (which a `disabled` attribute alone would not survive) therefore changes nothing about what gets
 * sent, because nothing reads it. "Chose Supabase, silently received SQLite" has no code path to
 * travel down, which is the standard the rest of this screen is already held to — see `Sites.tsx`'s
 * header on why not lying is this screen's actual job.
 *
 * The option is still SHOWN, with the access-token field present but inert, because the owner asked
 * to see the database step and because hiding an unbuilt option teaches nothing; what makes that
 * honest is that its unavailability is stated in words, not merely rendered grey.
 *
 * ## Chat data
 *
 * "Chats always use SQLite" is literally true and deliberate, not a simplification: chat history
 * lives in a separate `chat.db` sidecar (`platform/db/sqlite/chat-db.ts`), specifically so that a
 * whole-file restore or duplicate of `content.db` can never carry — or erase — conversation
 * history. Stating it here keeps the one selectable choice on screen from reading as though it
 * governed every database the site has.
 *
 * ## Guards
 *
 * All three of the create-form guards that landed before this restructure survive it unchanged, and
 * each is pinned by its own test: the name field disables while a create is in flight or switching
 * is off ({@link resolveCreateInputDisabled}), the submit button keeps its four-condition guard
 * ({@link resolveCreateSubmitDisabled}), and the "Created." line clears the moment the operator
 * edits the name again (via the controller's own `setCreateName`, which this tab routes every edit
 * through rather than holding a local copy).
 */

/** One numbered step. A render helper (it returns JSX), so it stays in this file per the repo's
 *  `.tsx`-carries-no-derived-logic rule — `TabBar.tsx`'s `tabDotAccessibleSuffix` makes the same
 *  call for the same reason. The number is `aria-hidden`: it is a visual position marker, and the
 *  heading beside it already carries the step's actual name. */
function QuestionStep({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <li className="site-step">
      <span className="site-step-mark" aria-hidden="true">
        {index}
      </span>
      <div className="site-step-body">
        <h2 className="site-step-title">{title}</h2>
        {children}
      </div>
    </li>
  );
}

/** The SQLite option: the only backend site creation can actually produce, so it is fixed rather
 *  than merely pre-selected. `readOnly` plus no `onChange` means there is no interaction that could
 *  move the selection off it. */
function SqliteOption({ t }: { t: Translate }) {
  return (
    <div className={resolveDatabaseOptionClassName({ selected: true, available: true })}>
      <input type="radio" id="site-db-sqlite" name="site-db" value="sqlite" checked readOnly />
      <span className="site-db-option-text">
        <span className="site-db-option-head">
          <label className="site-db-option-name" htmlFor="site-db-sqlite">
            {t("SQLite")}
          </label>
          <span className="status status-ok">{t("Ready")}</span>
        </span>
        <span className="site-db-option-note">{t("A content.db file inside the site folder. No server, no credentials.")}</span>
      </span>
    </div>
  );
}

/** The Supabase option: shown, stated as unavailable, and wired to nothing — see this file's header
 *  for why that last part is structural rather than a matter of this `disabled` attribute.
 *
 *  A `<div>` with sibling `<label htmlFor>`s rather than one wrapping `<label>`: this option
 *  carries a second labelled control (the access-token field), and a `<label>` nested inside
 *  another `<label>` is invalid HTML whose accessible-name resolution genuinely is ambiguous —
 *  every assistive tech would be guessing which control the outer label named. {@link SqliteOption}
 *  is built the same way for symmetry even though it has only one control. */
function SupabaseOption({ t }: { t: Translate }) {
  return (
    <div className={resolveDatabaseOptionClassName({ selected: false, available: false })}>
      <input type="radio" id="site-db-supabase" name="site-db" value="supabase" disabled aria-disabled="true" />
      <span className="site-db-option-text">
        <span className="site-db-option-head">
          <label className="site-db-option-name" htmlFor="site-db-supabase">
            {t("Supabase")}
          </label>
          <span className="status status-neutral">{t("Not supported yet")}</span>
        </span>
        <span className="site-db-option-note">{t("Tovu creates every site's content database as SQLite. Choosing this would not change that, so it can't be chosen.")}</span>
        <span className="field site-db-token">
          <label className="field-label" htmlFor="site-db-supabase-token">
            {t("Supabase access token")}
          </label>
          <input id="site-db-supabase-token" name="supabase-token" type="password" disabled placeholder="sbp_…" autoComplete="off" />
          <span className="field-hint">{t("Shown for what's coming. It isn't stored anywhere yet.")}</span>
        </span>
      </span>
    </div>
  );
}

/** The database question's body. Its own component so {@link NewSiteTab} does not carry these three
 *  children plus its own form wiring in one function. */
function DatabaseQuestion({ t }: { t: Translate }) {
  return (
    <>
      <div
        className="site-db-options"
        role="group"
        aria-label={t("Content database")}
        {...agentHandle("sites-create-database", {
          role: "region",
          label: "Which database backs the new site's content — SQLite is the only one Tovu can create today",
        })}
      >
        <SqliteOption t={t} />
        <SupabaseOption t={t} />
      </div>
      <p className="field-hint">{t("Chats always use SQLite, in a separate chat.db — restoring content never touches conversation history.")}</p>
    </>
  );
}

export interface NewSiteTabProps {
  controller: Pick<
    ReturnType<typeof useWiredSites>,
    "createName" | "setCreateName" | "createNameError" | "createSite" | "creating" | "createdName" | "switchingEnabled" | "t"
  >;
}

/** The name question's body — the field, and its hint-or-error line. */
function NameQuestion({ controller }: NewSiteTabProps) {
  const { createName, setCreateName, createNameError, creating, switchingEnabled, t } = controller;
  return (
    <div className="field">
      <label className="field-label" htmlFor="site-name">
        {t("Folder name")}
      </label>
      <input
        id="site-name"
        name="name"
        className="site-name-input"
        value={createName}
        disabled={resolveCreateInputDisabled({ creating, switchingEnabled })}
        placeholder="my-second-site"
        autoComplete="off"
        onChange={(e) => setCreateName(e.target.value)}
        {...agentHandle("sites-create-name", { role: "field", label: "New site folder name" })}
      />
      {createNameError ? <p className="field-error">{createNameError}</p> : <p className="field-hint">{t("Lowercase letters, digits, and dashes.")}</p>}
    </div>
  );
}

/** The final step's body: the submit button, the restart truth, and the success line. The restart
 *  sentence is not decoration — creating a site never switches the running server onto it, and this
 *  is the step where an operator would otherwise assume it did. */
function CreateQuestion({ controller }: NewSiteTabProps) {
  const { createName, createNameError, creating, switchingEnabled, createdName, t } = controller;
  return (
    <>
      <p className="site-step-lead">{t("Creating a site never switches this server onto it. Activate it from All sites, then restart.")}</p>
      <div className="editor-actions form-actions">
        <button
          type="submit"
          disabled={resolveCreateSubmitDisabled({ creating, switchingEnabled, createNameError, createName })}
          {...agentHandle("sites-create-submit", { role: "button", label: "Create the site folder" })}
        >
          {creating ? t("Creating…") : t("Create site")}
        </button>
      </div>
      {createdName ? <p className="save-ok">{t("Created. Activate it to serve after the next restart.")}</p> : null}
    </>
  );
}

export function NewSiteTab({ controller }: NewSiteTabProps) {
  return (
    <form
      className="site-wizard"
      {...agentHandle("sites-create-form", { role: "form", label: "Create a new site folder under sites/" })}
      onSubmit={(e) => {
        e.preventDefault();
        controller.createSite();
      }}
    >
      <p className="card-lead site-wizard-lead">{controller.t("A new folder under sites/, with its own content, uploads, and themes.")}</p>
      <ol className="site-steps">
        <QuestionStep index={1} title={controller.t("Name it")}>
          <NameQuestion controller={controller} />
        </QuestionStep>
        <QuestionStep index={2} title={controller.t("Content database")}>
          <DatabaseQuestion t={controller.t} />
        </QuestionStep>
        <QuestionStep index={3} title={controller.t("Create it")}>
          <CreateQuestion controller={controller} />
        </QuestionStep>
      </ol>
    </form>
  );
}
