import { AGENT_PRIVATE_ATTRIBUTE, agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { siteTokenGenerateErrorMessage } from "./security-i18n";
import { useWiredSiteToken } from "./hooks/use-site-token.hooks";
import type { SiteTokenController, SiteTokenGenerateFailure } from "./hooks/use-site-token.hooks";
import { useRevealedKeyCopy } from "./SiteTokenTab.hooks";
import type { Translate } from "../../lib/dictionary-translator";

/**
 * @file The Secrets page's Site Token tab — view/reveal/generate the file half of
 * `TOVU_INTEGRATIONS_ROOT_KEY`'s resolution (`features/webhooks/keyring.env.ts`, server-side).
 *
 * ## What this tab covers, as of the 2026-09-09 durability fix
 *
 * A generated key file now genuinely protects production too: it lives on the durable Fly volume
 * (not the container's ephemeral rootfs), the production boot gate accepts it, and the keyring
 * that seals every real stored credential (BYOK, publish/source-control/custom creds,
 * media-provider secrets) can now read one. {@link SiteTokenScopeNotice} still discloses the one
 * remaining gap: webhook signing / newsletter tokens still require the env var in production —
 * that keyring's own construction is deliberately unchanged this pass (a committed regression
 * test pins it). See `server/inbound/admin-http/routes/system/site-token.ts`'s header for the
 * full account, including the accepted tradeoff (a key file now lives beside the database it
 * protects — a volume backup carries both).
 *
 * ## No rotate/replace
 *
 * `POST .../generate` only ever creates. Replacing an existing key would orphan every secret
 * already sealed under the old one, and a confirmation strong enough for that (not a generic "are
 * you sure") is a separate, NOT-built feature — reported as out of scope rather than half-built.
 * Once a key is active (`status.active`), {@link SiteTokenGenerateAction} shows no control that
 * could be mistaken for one.
 *
 * ## Reveal — one mechanism, available any time a key is active
 *
 * An earlier brief had generate show its new value once, at creation, fingerprint-only after
 * that. The owner superseded it: "i want that token to be visible to admins or else when it
 * breaks they have no idea whats going on." {@link SiteTokenRevealAction} is the ONE place this
 * tab ever renders a key VALUE — never on page load, only behind its own explicit click, and
 * usable at any time afterward (not just right after a generate), for exactly the diagnostic
 * reason the owner gave: confirming the value here matches what's set in `fly secrets`, or
 * figuring out why credentials stopped decrypting. No audit trail on reveal — this codebase has
 * no general-purpose sensitive-read audit mechanism to hook into (checked, not built here).
 */

export interface SiteTokenTabProps {
  /** DI seam for tests — same convention as every other wired-hook prop in this app. */
  useSiteTokenHook?: typeof useWiredSiteToken;
}

function resolveSiteTokenHook(override: typeof useWiredSiteToken | undefined): typeof useWiredSiteToken {
  return override ?? useWiredSiteToken;
}

export function SiteTokenTab(props: SiteTokenTabProps) {
  const useSiteTokenHook = resolveSiteTokenHook(props.useSiteTokenHook);
  const controller = useSiteTokenHook();
  return (
    <div
      className="site-token-tab"
      {...agentHandle("security-site-token", {
        role: "region",
        label: "View, reveal, and generate the Site Token that protects every credential this install holds",
      })}
    >
      <SiteTokenBody controller={controller} />
    </div>
  );
}

/** Loading/error/loaded split — pulled out purely for the complexity gate, same reasoning
 *  `AccessTokensBody` documents in `AccessTokensTab.tsx`. */
function SiteTokenBody({ controller }: { controller: SiteTokenController }) {
  const translate = controller.t;
  if (controller.loadError) {
    return (
      <p className="notice error" role="status" {...agentHandle("security-site-token-load-error", { role: "status", label: "Shows the error when the Site Token's status could not be loaded" })}>
        {controller.loadError}
      </p>
    );
  }
  if (controller.status === undefined) {
    return <p className="site-token-loading">{translate("Loading…")}</p>;
  }
  return (
    <>
      <SiteTokenScopeNotice runtimeMode={controller.status.runtimeMode} t={translate} />
      <SiteTokenStatusCard controller={controller} />
    </>
  );
}

/** The always-visible "what this covers" disclosure — see this file's header. Rendered
 *  unconditionally, not just on failure: the fact it states is true whether or not anything has
 *  gone wrong, and the owner's own "self-contained" framing is exactly what this exists to make
 *  precise before anyone clicks anything.
 *
 *  Rewritten 2026-09-09 per the owner's live review ("the site token content needs to be simpler
 *  ... users are not gonna know what this even is"): leads with one plain sentence any operator
 *  can act on, keeps the production-only storage tradeoff visible (it changes what someone should
 *  do, not just background trivia), and demotes the webhook/newsletter exception to a de-emphasized
 *  note — same `.jini-field-hint` convention `AgentPlugins.tsx`'s section footnotes use — since it's
 *  a real but secondary caveat, not something a first-time reader needs to parse up front. */
function SiteTokenScopeNotice({ runtimeMode, t: translate }: { runtimeMode: "production" | "local"; t: Translate }) {
  return (
    <div className="notice warning site-token-scope-notice" {...agentHandle("security-site-token-scope-notice", { role: "status", label: "What this Site Token does and does not cover" })}>
      <p>{translate("This key protects the passwords, API keys, and other credentials you've saved in Tovu — including on your live site.")}</p>
      {runtimeMode === "production" ? (
        <p>{translate("On a live site, this key is stored right next to your database. Anyone who gets a full backup of your server would get both your data and the key that unlocks it.")}</p>
      ) : null}
      <p className="jini-field-hint site-token-scope-detail">
        {translate("One exception: webhook signing and newsletter unsubscribe links stay protected separately on your live site, whether or not you generate a key here.")}
      </p>
    </div>
  );
}

/** The status card — badge + fingerprint + source-specific note + Reveal + Generate. Split out
 *  purely for the complexity gate. */
function SiteTokenStatusCard({ controller }: { controller: SiteTokenController }) {
  const translate = controller.t;
  const status = controller.status;
  if (!status) return null;
  return (
    <section className="card site-token-status-card" {...agentHandle("security-site-token-status", { role: "region", label: "The active Site Token's source, fingerprint, and reveal control" })}>
      <h3 className="site-token-status-heading">{translate("Site Token")}</h3>
      <p className="site-token-status-badge-row">
        <span className={`status ${siteTokenStatusBadgeClass(status.active, status.invalid)}`}>{siteTokenStatusBadgeLabel(status.active, status.source, translate)}</span>
        {status.fingerprint ? (
          <span className="site-token-fingerprint-group" title={translate("A short ID for this key. It changes if the key changes.")}>
            <span className="site-token-fingerprint-label">{translate("Fingerprint")}</span>
            <code className="site-token-fingerprint">{status.fingerprint}</code>
          </span>
        ) : null}
      </p>
      <p className="site-token-status-note">{siteTokenStatusNote(status, translate)}</p>
      <SiteTokenRevealAction controller={controller} />
      {/* Site-key plan (2026-09-24) §A.6: Generate is hidden by default, not deleted — the
          server route, `useSiteToken`'s `generate()`, and this tab's own `SiteTokenGenerateAction`
          all stay wired (see that component's own header) so a later slice can re-expose it (e.g.
          behind an "advanced" disclosure) without rebuilding the plumbing. There is no existing
          "advanced" disclosure pattern on this tab to tuck it into, so this pass just hides it. */}
    </section>
  );
}

function siteTokenStatusBadgeClass(active: boolean, invalid: boolean | undefined): string {
  if (invalid) return "status-warning";
  return active ? "status-ok" : "status-neutral";
}

function siteTokenStatusBadgeLabel(active: boolean, source: "env" | "file" | "none", translate: Translate): string {
  if (!active) return translate("None");
  return source === "env" ? translate("Active — environment variable") : translate("Active — key file");
}

/** The source-specific explanatory line under the badge — one sentence per case, no `{path}`
 *  template needed (the path is rendered as its own `<code>`, not interpolated into translated
 *  prose). Reworded 2026-09-09 alongside {@link SiteTokenScopeNotice} so the badge's
 *  "environment variable" vs. "key file" distinction is explained in plain terms here rather than
 *  assumed — the badge itself stays terse, this line carries the plain-language context. The
 *  `TOVU_INTEGRATIONS_ROOT_KEY` variable name stays in the invalid-env case since fixing it requires
 *  that exact name. @complexity O(1). */
function siteTokenStatusNote(status: { active: boolean; source: "env" | "file" | "none"; invalid?: boolean; keyFilePath: string }, translate: Translate) {
  if (status.invalid) {
    return status.source === "env" ? (
      <>{translate("A key is set up for this install, but it's not in a usable format, so Tovu can't use it. Fix the value stored in the TOVU_INTEGRATIONS_ROOT_KEY environment variable to resolve this.")}</>
    ) : (
      <>
        {translate("The key file at")} <code>{status.keyFilePath}</code> {translate("isn't in a usable format, so Tovu can't use it. It will need to be replaced by hand on the server — this tab can't do that yet.")}
      </>
    );
  }
  if (status.source === "env") {
    return <>{translate("This key was set up directly on the server rather than as a file, and it's already active — there's nothing to do here. Changing it means updating it on the server and restarting.")}</>;
  }
  if (status.source === "file") {
    return (
      <>
        {translate("Stored in a file on this server, at")} <code>{status.keyFilePath}</code>
      </>
    );
  }
  return (
    <>
      {translate("No key has been created yet. Generating one saves it to")} <code>{status.keyFilePath}</code> {translate("on this server.")}
    </>
  );
}

/** Reveal — never shown on page load; the button is present whenever a key is active, and clicking
 *  it fetches (and displays, with a copy control) the raw value. Human-only: Reveal carries no agent
 *  handle, so the assistant's page driver cannot click it. {@link SiteTokenRevealedValue}'s
 *  own Hide button toggles it back off, client-side only (no server call). @complexity O(1). */
function SiteTokenRevealAction({ controller }: { controller: SiteTokenController }) {
  const translate = controller.t;
  const status = controller.status;
  if (!status?.active) return null;
  if (controller.revealedHex) {
    return <SiteTokenRevealedValue hex={controller.revealedHex} onHide={controller.hideRevealed} t={translate} />;
  }
  return (
    <div className="site-token-reveal-action">
      <button
        type="button"
        className="btn-secondary"
        disabled={controller.revealing}
        onClick={() => void controller.reveal()}
      >
        {controller.revealing ? translate("Revealing…") : translate("Reveal")}
      </button>
      {controller.revealError ? (
        <p className="notice error" role="status" {...agentHandle("security-site-token-reveal-error", { role: "status", label: "Shows the error when revealing the Site Token failed" })}>
          {controller.revealError}
        </p>
      ) : null}
    </div>
  );
}

/** The revealed value itself, plus Copy/Hide — the ONLY place in this tab that ever renders a key
 *  VALUE rather than a fingerprint. The value is `data-agent-private`, so no published ancestor's
 *  text carries it to the agent, and neither it nor Copy has a handle. @complexity O(1). */
function SiteTokenRevealedValue({ hex, onHide, t: translate }: { hex: string; onHide: () => void; t: Translate }) {
  const { copied, copy } = useRevealedKeyCopy(hex);
  return (
    <div className="site-token-revealed-value">
      <code {...{ [AGENT_PRIVATE_ATTRIBUTE]: "" }}>{hex}</code>
      <div className="site-token-revealed-actions">
        <button type="button" className="btn-secondary" onClick={() => void copy()}>
          {copied ? translate("Copied!") : translate("Copy")}
        </button>
        <button type="button" className="btn-ghost" onClick={onHide} {...agentHandle("security-site-token-hide", { role: "button", label: "Hide the revealed Site Token" })}>
          {translate("Hide")}
        </button>
      </div>
    </div>
  );
}

/** The Generate button + its own error banner. Shown only for the genuinely decidable case — no
 *  key at all (`status.source === "none"`) — never once a key is active, and never for an
 *  existing-but-invalid file or env var either (sol packet-3 finding 3-1, 2026-09-16): the server
 *  route only ever CREATES a key file, so offering Generate against a file that already exists
 *  (valid or not) is a guaranteed 409 with no path to success. A confirmed replace/rotate flow for
 *  that state is a separate, deliberately NOT-built feature (this file's own header). Works in
 *  every runtime mode now (2026-09-09 durability fix) — no longer disabled in production.
 *  @complexity O(1). */
function SiteTokenGenerateAction({ controller }: { controller: SiteTokenController }) {
  const translate = controller.t;
  const status = controller.status;
  if (!status || status.source !== "none") return null;
  return (
    <div className="site-token-generate-action">
      <button
        type="button"
        className="btn-primary"
        disabled={controller.generating}
        onClick={() => void controller.generate()}
        {...agentHandle("security-site-token-generate", { role: "button", label: "Generate a Site Token file for this install" })}
      >
        {controller.generating ? translate("Generating…") : translate("Generate a key")}
      </button>
      {controller.generateError ? <SiteTokenGenerateErrorNote failure={controller.generateError} t={translate} /> : null}
    </div>
  );
}

function SiteTokenGenerateErrorNote({ failure, t: translate }: { failure: SiteTokenGenerateFailure; t: Translate }) {
  const locale = useAdminLocale();
  const text =
    failure.kind === "env-active"
      ? translate("A key is already set up directly on the server for this install, and that one always wins. Generating one here wouldn't actually take effect.")
      : failure.kind === "already-exists"
        ? translate("A key file already exists. This tab only creates a new key — it never overwrites one.")
        : siteTokenGenerateErrorMessage(locale, failure.detail);
  return (
    <p className="notice error" role="status" {...agentHandle("security-site-token-generate-error", { role: "status", label: "Shows the error when generating a Site Token file failed" })}>
      {text}
    </p>
  );
}
