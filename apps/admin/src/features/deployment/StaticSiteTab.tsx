import { useState } from "react";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";
import {
  PUBLISH_ASSISTANT_REQUEST,
  PUBLISH_CLI_TOOLS,
  STATIC_HOSTS,
  STATIC_SITE_CAPABILITIES,
  type PublishCliTool,
} from "./rules";
import { AssistantIcon, CapabilityList, StaticSiteIcon } from "./deployment-visuals";

/**
 * @file Static Site tab — what a static export produces, the real command that produces one, where
 * the output can be hosted, and a deliberately inert build action with a truthful reason.
 *
 * CORRECTED mid-build (first pass): `development/docs/deployment/deployment-constraints.md` §3 said
 * the static exporter did not exist, and that was true when that pass started. It stopped being
 * true partway through the same session — a concurrent teammate landed `src/export/route-manifest
 * .ts` (`RouteManifestPort`, resolving home/products/theme pages via the SAME functions the real
 * public routes use, plus a synthetic 404 probe), `src/export/site-exporter.ts` (`exportSite`), and
 * `src/cli/commands/export.ts` (`tovu export <dir>`). Verified directly, not taken on faith:
 * `grep -rln "runExportCommand\|exportSite\b" src/server/routes` returns nothing, so the exporter is
 * real but CLI-only — there is still no HTTP route this admin screen could call, which is why the
 * button below stays inert.
 *
 * ## Second pass (2026-08-15) — what changed and why
 *
 * The command was prose. "Run tovu export <dir> and Tovu writes a static copy…" put the one thing
 * on this tab a reader actually needs to transcribe inside a sentence, unstyled, with nothing to
 * click — on a screen whose entire job is to hand a developer a command. It is now a real command
 * block with a Copy button. The `$` prompt is a CSS `::before`, so it is not part of what gets
 * copied.
 *
 * `<dir>` is left as the literal placeholder the CLI's own usage string uses, with a hint saying to
 * replace it. Substituting a plausible-looking `./dist` would be inventing a default this project
 * does not have — see `src/cli/commands/export.ts`, where the directory is a required argument with
 * no fallback.
 *
 * The four cards became two. "What it produces" and "what it costs you" were two cards stating one
 * fact, and `STATIC_SITE_CAPABILITIES` now states both at once as one list — the same list the
 * Overview tab's comparison renders, so a reader meets it twice in the same shape rather than as a
 * comparison in one place and a prose warning in another. The hosts list lost its bullet discs: four
 * proper nouns with nothing ranking them read as chips, not as an ordered argument.
 *
 * `STATIC_HOSTS` (`rules.ts`) is the fixed four-host list from the brief — proper nouns, never
 * translated, and marked `translate="no"` so a machine translator leaves them alone too.
 */

/** A line of text the reader is meant to take somewhere else, with a Copy button.
 *
 *  Two variants, because this tab now hands over two different KINDS of text: a shell command
 *  (`prose={false}`, monospace, rendered with a `$` prompt via CSS) and a sentence to say to the
 *  assistant (`prose`, UI face, no prompt). Sharing one component keeps the copy affordance
 *  identical between them; the variant only changes what the box claims the text is. Putting a `$`
 *  in front of an English sentence would tell the reader to type it into a terminal, where it does
 *  nothing.
 *
 *  Component-local `useState` rather than a hook + port pair, which is the documented carve-out this
 *  app already applies to `ThemeExplore.tsx`'s device-width/fullscreen state: there is nothing to
 *  inject. `use-dockerfile-source.hooks.ts` keeps ITS copy handler in a hook for the opposite
 *  reason — that one copies fetched data the hook already owns, whereas this copies a constant.
 *
 *  A denied clipboard permission is swallowed, same as everywhere else in this app: the text is
 *  visible and selectable in the block itself, so a failed copy degrades to "select it manually"
 *  rather than to an error the reader can do nothing about. */
function CopyLine({
  text,
  prose,
  copyLabel,
  copiedLabel,
  copyAccessibleName,
}: {
  text: string;
  prose?: boolean;
  copyLabel: string;
  copiedLabel: string;
  /** Distinguishes the two Copy buttons that now share this tab. Two controls whose only accessible
   *  name is "Copy" are ambiguous to anyone listing the page's buttons, and "Copy" is a substring of
   *  each name passed here, which is what keeps the visible label a valid part of the accessible one
   *  (WCAG 2.5.3 Label in Name). */
  copyAccessibleName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — see this component's doc.
    }
  }

  return (
    <div className={`deployment-command${prose ? " deployment-command-prose" : ""}`}>
      <code translate={prose ? undefined : "no"}>{text}</code>
      {/* `aria-live="polite"` on the label so the swap to "Copied!" is announced — an action whose
          only feedback is a silent visual label change is invisible to a screen-reader user. */}
      <button type="button" className="btn-secondary" onClick={() => void copy()} aria-label={copyAccessibleName}>
        <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
      </button>
    </div>
  );
}

/** One CLI the assistant can drive. Reuses the Full Site provider row's markup deliberately — see
 *  `PublishCliTool`'s own doc comment in `rules.ts` for why, and for where a real installed/not-
 *  installed pill goes once the server can actually check. */
function PublishToolRow({ tool, locale }: { tool: PublishCliTool; locale: string }) {
  return (
    <li className="deployment-provider-list-item">
      <span className="deployment-provider-name">
        <span translate="no">{tool.name}</span>
        <span className="deployment-tool-command" translate="no">
          {tool.command}
        </span>
      </span>
      <p>{t(locale, tool.descriptionKey)}</p>
    </li>
  );
}

/**
 * The recommended publishing route: ask the assistant to install two CLIs, then let it drive them.
 *
 * ## Why this is the recommended route and not just an option
 *
 * Tovu's assistant is a spawned coding-agent CLI with a real shell (project memory:
 * `@jini-ai/agent-runtime`, PATH detection, no API key). If `gh` and `vercel` are present it can
 * publish directly — no token pasted into this admin, nothing stored, no provider adapter involved.
 * The token-based path is strictly more machinery for strictly less capability, so the recommended
 * one leads and the fallback is a single muted line underneath.
 *
 * ## Why there is no installed/not-installed indicator here
 *
 * There is no PATH-detection endpoint as of 2026-08-15 — the server genuinely cannot tell whether
 * either binary exists. So this block shows NO per-tool badge, tick, spinner, or "checking…" state,
 * because every one of those would be reporting a check that never ran, and a greyed-out badge
 * reads as "not installed" rather than "not known". Instead the gap is stated in words, once,
 * directly under the list, and the copyable request itself asks the assistant to answer the
 * question this screen cannot. When detection lands, that one sentence is what gets replaced; the
 * rows, their order and their keys already exist and gain a pill in the slot the Full Site provider
 * rows use. That is the difference between a reserved slot and a rewrite.
 */
function PublishRoute({ locale }: { locale: string }) {
  return (
    <div className="deployment-route">
      <div className="deployment-route-label">
        <AssistantIcon size={16} />
        <span className="deployment-fact-label">{t(locale, "Recommended — ask the assistant")}</span>
      </div>
      <p className="deployment-action-reason">
        {t(
          locale,
          "Tovu's assistant runs as a command-line coding agent with its own shell, so once these two tools are installed it can publish the export for you — nothing to paste here, and no credentials stored."
        )}
      </p>
      <CopyLine
        text={PUBLISH_ASSISTANT_REQUEST}
        prose
        copyLabel={t(locale, "Copy")}
        copiedLabel={t(locale, "Copied!")}
        copyAccessibleName={t(locale, "Copy this request to the assistant")}
      />
      <ul className="deployment-provider-list">
        {PUBLISH_CLI_TOOLS.map((tool) => (
          <PublishToolRow key={tool.id} tool={tool} locale={locale} />
        ))}
      </ul>
      <p className="deployment-action-reason deployment-route-note">
        {t(locale, "Tovu can't see what's installed on the server yet, so this is a recommendation rather than a check — the assistant can tell you which ones it found.")}
      </p>
    </div>
  );
}

export function StaticSiteTab() {
  const locale = useAdminLocale();
  const translate = (key: string): string => t(locale, key);

  return (
    <div className="deployment-tab">
      <div className="card">
        <div className="card-head">
          <div className="deployment-path-head">
            <span className="deployment-path-icon">
              <StaticSiteIcon />
            </span>
            <h2 className="card-title">{t(locale, "What a static export gives you")}</h2>
          </div>
          <div className="card-head-actions">
            <span className="status status-neutral">{t(locale, "Available from a terminal")}</span>
          </div>
        </div>
        <div className="deployment-card-body">
          <p className="card-lead">
            {t(locale, "A fast, read-only copy of this site's published pages — no server behind it.")}
          </p>
          <div className="deployment-split">
            <div>
              <span className="deployment-fact-label">{t(locale, "What survives the export")}</span>
              <CapabilityList rows={STATIC_SITE_CAPABILITIES} t={translate} />
            </div>
            <div>
              <span className="deployment-fact-label">{t(locale, "Where it runs")}</span>
              <ul className="deployment-chips">
                {STATIC_HOSTS.map((host) => (
                  <li key={host} translate="no">
                    {host}
                  </li>
                ))}
              </ul>
              <p className="deployment-action-reason">
                {t(locale, "The output is a plain folder of files — any static host will serve it.")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{t(locale, "Build it from a terminal")}</h2>
        </div>
        <div className="deployment-card-body">
          <p className="card-lead">
            {t(locale, "Tovu writes every published post, the home page, products and theme pages into the folder you name.")}
          </p>
          <CopyLine
            text="tovu export <dir>"
            copyLabel={t(locale, "Copy")}
            copiedLabel={t(locale, "Copied!")}
            copyAccessibleName={t(locale, "Copy the export command")}
          />
          <p className="deployment-action-reason">
            {t(locale, "Replace <dir> with the folder to write into. It is a required argument — there is no default.")}
          </p>
          {/* Inert, not hidden — the affordance's SHAPE is real (this is where a build will start
              once this screen can reach the exporter over HTTP), only its function is not. A hidden
              button would tell the operator nothing; an enabled one that does nothing would tell
              them something false.

              `aria-disabled` rather than the `disabled` attribute, changed in this pass: `disabled`
              removes the control from the tab order entirely, so a keyboard or screen-reader user
              never reaches it and never hears the reason it cannot be used — the reason being the
              entire point of rendering it at all. With `aria-disabled` the button stays focusable
              and announces as dimmed, and `aria-describedby` ties the reason text to it so that is
              read out too. There is no `onClick`, so it remains genuinely inert. */}
          <div className="deployment-action">
            <button type="button" className="btn-secondary" aria-disabled="true" aria-describedby="static-export-reason">
              {t(locale, "Build static export")}
            </button>
            <p className="deployment-action-reason" id="static-export-reason">
              {t(
                locale,
                "Not available from this screen yet — no admin route can start an export. Run the command above instead."
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Third and last, because it is genuinely the third step: the tab used to end at "you now
          have a folder", which is the point at which the reader still has the hardest part of the
          job in front of them. */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{t(locale, "Getting it online")}</h2>
        </div>
        <div className="deployment-card-body">
          <p className="card-lead">
            {t(locale, "The export is just a folder of files. Putting it on GitHub Pages or Vercel is the last step, and the assistant can do that part for you.")}
          </p>
          <PublishRoute locale={locale} />
          {/* The fallback is stated so the recommendation cannot read as a prerequisite wall, and
              stated as PLANNED because that is what it is — another agent is building the
              token-based path now, and describing it as available would be the one fabrication this
              whole screen has avoided. */}
          <p className="deployment-action-reason">
            {t(locale, "If those tools can't be installed, a token-based fallback is planned — this route is a shortcut, not a requirement.")}
          </p>
        </div>
      </div>
    </div>
  );
}
