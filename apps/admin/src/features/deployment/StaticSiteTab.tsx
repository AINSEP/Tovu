import { useState } from "react";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";
import { STATIC_HOSTS, STATIC_SITE_CAPABILITIES } from "./rules";
import { CapabilityList, StaticSiteIcon } from "./deployment-visuals";

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

/** The one real command this tab exists to hand over, with a Copy button.
 *
 *  Component-local `useState` rather than a hook + port pair, which is the documented carve-out this
 *  app already applies to `ThemeExplore.tsx`'s device-width/fullscreen state: there is nothing to
 *  inject. `use-dockerfile-source.hooks.ts` keeps ITS copy handler in a hook for the opposite
 *  reason — that one copies fetched data the hook already owns, whereas this copies a constant.
 *
 *  A denied clipboard permission is swallowed, same as everywhere else in this app: the command is
 *  visible and selectable in the block itself, so a failed copy degrades to "select it manually"
 *  rather than to an error the reader can do nothing about. */
function CommandBlock({ command, copyLabel, copiedLabel }: { command: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — see this component's doc.
    }
  }

  return (
    <div className="deployment-command">
      <code translate="no">{command}</code>
      {/* `aria-live="polite"` on the label so the swap to "Copied!" is announced — an action whose
          only feedback is a silent visual label change is invisible to a screen-reader user. */}
      <button type="button" className="btn-secondary" onClick={() => void copy()}>
        <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
      </button>
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
          <CommandBlock command="tovu export <dir>" copyLabel={t(locale, "Copy")} copiedLabel={t(locale, "Copied!")} />
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
    </div>
  );
}
