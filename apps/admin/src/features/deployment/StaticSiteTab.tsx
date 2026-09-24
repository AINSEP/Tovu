import { useState } from "react";
import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { TabBar } from "../../components/TabBar";
import { formatTimestamp } from "../../lib/format-timestamp";
import type {
  AdminDeployCliStatus,
  AdminExportRunSnapshot,
  AdminPublishExecutionMode,
  AdminPublishRunSnapshot,
  AdminStaticPublishPreview,
  AdminStaticPublishTargetId,
} from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { t } from "./deployment-i18n";
import {
  STATIC_HOSTS,
  STATIC_PUBLISH_TARGETS,
  STATIC_SITE_CAPABILITIES,
  PUBLISH_CLI_TOOLS,
  cliInstalledStatus,
  exportRunStatusLabelKey,
  publishAssistantRequest,
  publishCredentialProviderInfo,
  publishCredentialRowReadyToSave,
  publishRunStatusLabelKey,
  runStatusTone,
  staticPublishFormReadyForPreview,
  staticPublishFormReadyToPublish,
  credentialVerifyStatusClass,
  staticPublishProjectNameCopy,
  type PublishCliTool,
  type PublishCredentialFormFields,
} from "./rules";
import { AssistantIcon, CapabilityList, DisclosureChevron, StaticSiteIcon, StepDoneIcon } from "./deployment-visuals";
import { useWiredDeploymentOverview } from "./hooks/use-deployment-overview.hooks";
import type { DeploymentOverviewController } from "./hooks/use-deployment-overview.hooks";
import { useWiredStaticExport } from "./hooks/use-static-export.hooks";
import type { StaticExportController } from "./hooks/use-static-export.hooks";
import { useWiredStaticPublish } from "./hooks/use-static-publish.hooks";
import type { StaticPublishController } from "./hooks/use-static-publish.hooks";
import { useWiredPublishCredentials } from "./hooks/use-publish-credentials.hooks";
import type { PublishCredentialRowState, PublishCredentialsController } from "./hooks/use-publish-credentials.hooks";

/**
 * @file Static Site tab — what a static export produces, a real trigger+poll build action, and a
 * real per-provider publish flow to GitHub Pages, Vercel, Netlify, or Cloudflare Pages.
 *
 * ## Third pass (2026-08-15) — the two "not wired up yet" halves both got wired
 *
 * The second pass's own header traced a grep (`runExportCommand|exportSite\b` against
 * `src/server/routes`) that returned nothing, and concluded the build button had to stay inert. That
 * grep is now stale for a second time, the same way it was corrected once already: a concurrent
 * agent landed `src/server/routes/admin/system/export-site.ts` (`POST`/`GET .../system/export`,
 * trigger+poll, `system.export`-gated) the same session, registered in `server/app.ts`, tested in
 * `export-site-route.test.ts`. The build button below now calls it for real, through
 * `useWiredStaticExport` (`hooks/use-static-export.hooks.ts`).
 *
 * The publish half tells the same story a second time over: `src/server/routes/admin/system/
 * publish-site.ts` (preview + trigger + poll, wrapping `features/deployments/static-publish/`) also
 * landed the same session, cookie-authed — a HUMAN clicking Publish in this admin, not the AI
 * assistant (`deployment_execute_static_publish`, the agent-tool half of this same feature, stays
 * declared-but-never-wired on purpose; see that tool's own doc comment in `publish-agent-tools.ts`
 * for why: no confirmation-token transport exists yet for an agent to trigger an irreversible public
 * publish). The "Getting it online" card below now has a real provider picker, preview, and publish
 * action wired through `useWiredStaticPublish` (`hooks/use-static-publish.hooks.ts`), sitting
 * alongside the CLI-first assistant route rather than replacing it — see that card's own doc for how
 * the two relate.
 *
 * `deployClis` (`AdminDeploymentOverview.deployClis`, real PATH detection as of the same session —
 * `deployment-overview.ts`'s `isOnPath`) replaces the second pass's "Tovu can't see what's installed"
 * sentence with a real per-tool pill, SPLIT per provider rather than shown as one joint list — the
 * owner's own instruction: "split the installed GitHub CLI and Vercel CLI into different commands,
 * because maybe they only wanna use one, and it may be confusing." Someone with only `gh` on PATH who
 * only wants GitHub Pages now sees a complete GitHub-only path with no Vercel row anywhere near it.
 *
 * ## Fourth pass (2026-08-15) — the picker catches up to all four providers the credential form
 * already saved for
 *
 * The third pass wired a real picker, but `STATIC_PUBLISH_TARGETS` still only listed github-pages
 * and vercel even though `PUBLISH_CREDENTIAL_PROVIDERS` (below, in `rules.ts`) already covered all
 * four — a saved Netlify or Cloudflare Pages credential had no tab that could ever use it. Closed by
 * widening `STATIC_PUBLISH_TARGETS`/`AdminStaticPublishTargetId` to the full four-provider set the
 * server (`static-publish/adapter.ts`) already published to. Netlify and Cloudflare Pages have no
 * CLI this codebase drives, so their tab shows no CLI-first row at all (`StaticPublishTargetFields`'s
 * own doc) — the token-based credential form below is their only publish path today.
 *
 * ## Fifth pass (2026-08-15) — the credential section became a flat settings form, not a collection
 *
 * The fourth pass's credential block was still modelled as "manage a collection of named
 * connections": an "Add credential" button, a provider `<select>`, a user-invented `Label` field,
 * then a form. The owner's own read: "'Add credential' should be gone. Just list the providers,
 * labels, and access token space, and that's it" — plus a second complaint that the OLD edit-mode
 * form's placeholder text ("Leave blank to keep the current token") read as a prepopulated value at
 * a glance. `PublishCredentialsSection`/`PublishCredentialRow` below are the replacement: one
 * always-visible row per provider, no picker, no label, hints below every input rather than inside
 * it. See `use-publish-credentials.hooks.ts`'s own header for the hook-side half of this story.
 *
 * ## Sixth pass (2026-08-15) — a design pass on "it looks awful", with a fifth provider already on
 * the way
 *
 * Three fixes, none of them touching `use-static-publish.hooks.ts`/`use-static-export.hooks.ts`
 * (both off-limits this pass — their `busy`/`pollError` behaviour landed and was proven correct just
 * before this pass started; see `StaticPublishForm`'s own `busy` comment for the guard this pass
 * deliberately left alone):
 *
 * 1. "Publish directly from here" named nothing — a reader had no way to tell it apart from the
 *    credential above it. Renamed to "Where this publish goes", with a line contrasting it against
 *    the credential explicitly (`StaticPublishForm` below).
 * 2. `PublishCredentialRow`'s two-field layout (Cloudflare Pages only, today) broke under uneven
 *    field heights — see that component's own doc.
 * 3. Neither `StaticExportController.pollError` nor `StaticPublishController.pollError` was rendered
 *    ANYWHERE on this tab before this pass, despite both hooks having shipped it — a stalled poll
 *    silently re-enabled the button with no explanation on screen for why the spinner stopped.
 *    `BuildExportCard` and `StaticPublishForm` below now both render it, same `notice warning`
 *    treatment `PublishCredentialsSection`'s own hosted-mode notice already established on this tab.
 *
 * A fifth publish target (S3-compatible: AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces,
 * Wasabi, MinIO) is being spec'd separately and is NOT built here. It matters to this pass because it
 * will need roughly five credential fields (endpoint, access key id, secret access key, bucket,
 * region) with uneven hint lengths of its own — exactly the shape `PublishCredentialRow`'s single-
 * column fix (fix 2 above) exists to tolerate, and exactly why that fix did not just special-case
 * Cloudflare Pages' two fields.
 *
 * ## Seventh pass (2026-08-16) — the sixth pass polished the boxes; the owner's actual complaint was
 * that there were sixteen fields of them on screen at once
 *
 * The sixth pass ("Publish directly from here" -> "Where this publish goes", the two-field-row fix,
 * surfacing `pollError`) shipped, the owner looked at the running app, and the verdict was "it looks
 * just awful" — followed by the real diagnosis: `PublishCredentialsSection` rendered ALL FOUR
 * providers' credential forms simultaneously, regardless of which tab was selected. A reader on the
 * GitHub Pages tab saw GitHub Pages' fields, then Vercel's, then Netlify's, then Cloudflare Pages',
 * all inside one `<details>` — a wall of "ACCESS TOKEN" boxes nobody but that one reader's own
 * provider needed. Three changes, all in this file plus `TabBar.tsx`/`styles.css`:
 *
 * 1. **The credential section now renders exactly one row: the SELECTED provider's.** See
 *    `PublishCredentialsSection`'s own doc for the filter and why the id-set guarantee between
 *    `STATIC_PUBLISH_TARGETS` and `PUBLISH_CREDENTIAL_PROVIDERS` makes it safe. This is the fix the
 *    owner explicitly approved — collapsing a 4-row wall down to whichever one the reader is already
 *    looking at.
 * 2. **The connected/not-connected fact the old all-rows layout gave away for free moved onto the tab
 *    bar itself.** Collapsing to one row would otherwise have made it strictly WORSE than before —
 *    "which providers have I already connected" was visible pre-collapse (scroll down, look at four
 *    pills) and invisible post-collapse (click through every tab to find out) unless it went
 *    somewhere else. `TabBar.tsx`'s new `TabBarTab.dot`/`dotLabel` puts a small filled dot on any tab
 *    whose provider has a saved credential (`connectedProviderIds`, computed once from
 *    `credentialsController.rows` below) — visible from EVERY tab at once, which the old layout never
 *    actually managed either (you had to scroll to a row to see ITS OWN status, never all four at a
 *    glance without scrolling). Generic and opt-in on `TabBar.tsx` itself, so `Themes.tsx`/`Pages.tsx`
 *    (its other two callers) render unchanged — see that prop's own doc for the accessibility
 *    reasoning (presence, not color alone, carries the meaning).
 * 3. **Visual weight now matches actual importance.** Before this pass, `.deployment-route`'s tinted-
 *    surface-plus-`--primary`-left-border treatment was applied identically to three different-weight
 *    blocks: the CLI recommendation (a suggestion), the "no CLI path" note (a fact), and "Where this
 *    publish goes" (the actual Preview/Publish action — this tab's real job). Nothing stood out as
 *    more important than anything else. The CLI recommendation and the "no CLI path" note now use
 *    `.deployment-route-quiet` (`styles.css`) — same structure, no strong accent — so the one block
 *    that ends in a live "publish this to the public internet" action is the one block on this card
 *    that still looks like it. The credential row's own box also lost its NESTED border/background
 *    inside the Advanced `<details>`/hosted-mode `.deployment-route` it now sits alone in — a single
 *    row no longer needs to look like a card inside a card inside a disclosure.
 *
 * None of this touches `use-static-publish.hooks.ts`/`use-static-export.hooks.ts`, or the `busy`
 * guard `StaticPublishForm`'s own comment documents — both were verified correct earlier the same
 * day and stayed off-limits this pass too.
 */

/** A line of text the reader is meant to take somewhere else, with a Copy button.
 *
 *  Two variants, because this tab hands over two different KINDS of text: a shell command
 *  (`prose={false}`, monospace, rendered with a `$` prompt via CSS) and a sentence to say to the
 *  assistant (`prose`, UI face, no prompt). Sharing one component keeps the copy affordance
 *  identical between them; the variant only changes what the box claims the text is.
 *
 *  Component-local `useState` rather than a hook + port pair — there is nothing to inject, same
 *  carve-out `ThemeExplore.tsx`'s device-width/fullscreen state documents.
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
  agentHandleId,
}: {
  text: string;
  prose?: boolean;
  copyLabel: string;
  copiedLabel: string;
  /** Distinguishes the several Copy buttons this tab now has. Two controls whose only accessible
   *  name is "Copy" are ambiguous to anyone listing the page's buttons, and "Copy" is a substring of
   *  each name passed here, which is what keeps the visible label a valid part of the accessible one
   *  (WCAG 2.5.3 Label in Name). */
  copyAccessibleName: string;
  /** This component has several call sites in this tab (the export command, and one per publish
   *  CLI's "ask the assistant" line) — the id is caller-supplied rather than a constant baked into
   *  this component, same reason `copyAccessibleName` is. */
  agentHandleId: string;
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
      <button
        type="button"
        className="btn-secondary"
        onClick={() => void copy()}
        aria-label={copyAccessibleName}
        {...agentHandle(agentHandleId, { role: "button", label: copyAccessibleName })}
      >
        <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
      </button>
    </div>
  );
}

/** The counts half of a completed export run's detail — routes/assets succeeded-vs-failed, and
 *  where the export landed. Split out of {@link ExportRunResult} purely for the complexity gate:
 *  this repo's real `apps/admin` ESLint gate is a hard 9/9 cyclomatic/cognitive ceiling
 *  (`eslint.config.mjs`'s own `F06 option B` block), and this block's three independent ternaries
 *  (two failed-count checks, one optional `outputDir`) counted directly in `ExportRunResult` pushed
 *  it to 11 — same reasoning `PublishPreviewAction`'s own doc gives for splitting the publish half of
 *  this tab. No behavior moved, only where the branches are counted. */
function ExportRunCounts({ run, t: translate }: { run: AdminExportRunSnapshot; t: Translate }) {
  return (
    <div className="deployment-facts">
      <div className="deployment-fact">
        <span className="deployment-fact-label">{translate("Routes")}</span>
        <span className="deployment-fact-value">
          {run.counts!.routesSucceeded} {translate("succeeded")}
          {run.counts!.routesFailed > 0 ? `, ${run.counts!.routesFailed} ${translate("failed")}` : ""}
        </span>
      </div>
      <div className="deployment-fact">
        <span className="deployment-fact-label">{translate("Assets")}</span>
        <span className="deployment-fact-value">
          {run.counts!.assetsSucceeded} {translate("succeeded")}
          {run.counts!.assetsFailed > 0 ? `, ${run.counts!.assetsFailed} ${translate("failed")}` : ""}
        </span>
      </div>
      {run.outputDir ? (
        <div className="deployment-fact">
          <span className="deployment-fact-label">{translate("Written to")}</span>
          <span className="deployment-fact-value">
            <code translate="no">{run.outputDir}</code>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The failure-detail half of a completed export run — WHICH routes/assets failed and why, not just
 *  the aggregate counts {@link ExportRunCounts} shows. Split out for the same complexity-gate reason
 *  that function's own doc gives: two independent `&&`/length-check branches, one per list, counted
 *  directly in `ExportRunResult` is what pushed it over budget together with the counts block. */
function ExportRunFailures({ run, t: translate }: { run: AdminExportRunSnapshot; t: Translate }) {
  return (
    <>
      {run.failedRoutes && run.failedRoutes.length > 0 ? (
        <div className="deployment-failure-list">
          <span className="deployment-fact-label">{translate("Failed routes")}</span>
          <ul>
            {run.failedRoutes.map((failure, index) => (
              <li key={`${failure.kind}:${failure.path}:${index}`}>
                <code translate="no">{failure.path}</code> — {failure.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {run.failedAssets && run.failedAssets.length > 0 ? (
        <div className="deployment-failure-list">
          <span className="deployment-fact-label">{translate("Failed assets")}</span>
          <ul>
            {run.failedAssets.map((failure, index) => (
              <li key={`${failure.url}:${index}`}>
                <code translate="no">{failure.url}</code> — {failure.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/** One export run's completed/errored detail — counts, failures, and where it landed. Only rendered
 *  once `run.status` is `"completed"` or `"errored"`; a `"running"`/`"idle"` run has nothing here yet
 *  to report. Delegates to {@link ExportRunCounts}/{@link ExportRunFailures} for the complexity-gate
 *  reason each of those documents — this function itself now only decides WHICH detail to show. */
function ExportRunResult({ run, t: translate }: { run: AdminExportRunSnapshot; t: Translate }) {
  if (run.status === "errored") {
    return (
      <p className="save-error" role="alert">
        {run.error}
      </p>
    );
  }
  if (run.status !== "completed" || !run.counts) return null;
  return (
    <>
      <ExportRunCounts run={run} t={translate} />
      <ExportRunFailures run={run} t={translate} />
    </>
  );
}

/** The "Build it from a terminal" card's second half — the command block (unchanged) plus the real
 *  build action: a clean/overwrite checkbox, the Build button itself, a live status pill, and the
 *  run's own result once it settles. */
function BuildExportCard({ controller, t: translate }: { controller: StaticExportController; t: Translate }) {
  const tone = runStatusTone(controller.run?.status ?? "idle", controller.run?.ok);

  return (
    <div
      className="card"
      {...agentHandle("deployment-static-site-export-card", {
        role: "region",
        label: "Build a static export from this admin server, with a live run status and result",
      })}
    >
      <div className="card-head">
        <h2 className="card-title">{translate("Build it from a terminal")}</h2>
        <div className="card-head-actions">
          <span className={`status status-${tone}`}>{translate(exportRunStatusLabelKey(controller.run))}</span>
        </div>
      </div>
      <div className="deployment-card-body">
        {controller.loadError ? (
          <p
            className="notice error"
            role="status"
            {...agentHandle("deployment-static-site-export-load-error", {
              role: "status",
              label: "Shows the error when this export's current status could not be loaded",
            })}
          >
            {controller.loadError}
          </p>
        ) : null}
        <p className="card-lead">
          {translate("Tovu writes every published post, the home page, products and theme pages into the folder you name.")}
        </p>
        <CopyLine
          text="tovu export <dir>"
          copyLabel={translate("Copy")}
          copiedLabel={translate("Copied!")}
          copyAccessibleName={translate("Copy the export command")}
          agentHandleId="deployment-static-site-export-command-copy"
        />
        <p className="deployment-action-reason">
          {translate("Replace <dir> with the folder to write into. It is a required argument — there is no default.")}
        </p>

        <ExportTriggerAction controller={controller} t={translate} />
      </div>
    </div>
  );
}

/** The Build action — clean checkbox, the trigger button itself, and every terminal state a run can
 *  end in (a rejected trigger, a poll that gave up — {@link StaticExportController.pollError}, added
 *  this pass, see this file's header — and a settled run's own result). Split out of
 *  {@link BuildExportCard} for the same complexity-gate reason `PublishPreviewAction`'s own doc gives
 *  for the publish half of this tab: this repo's real `apps/admin` ESLint gate is a HARD 9/9
 *  cyclomatic/cognitive ceiling (`eslint.config.mjs`'s own `F06 option B` block — not the 15/warn the
 *  rest of the repo tolerates), and adding `pollError` as one more branch directly in
 *  `BuildExportCard` pushed it from 9 to 10 against that real gate. */
function ExportTriggerAction({ controller, t: translate }: { controller: StaticExportController; t: Translate }) {
  const busy = controller.triggering || controller.isRunning;
  return (
    <div className="deployment-action">
      <label className="form-checkbox-field">
        <input
          type="checkbox"
          checked={controller.clean}
          onChange={(e) => controller.setClean(e.target.checked)}
          {...agentHandle("deployment-static-site-export-clean", {
            role: "checkbox",
            label: "Overwrite the export output folder's existing contents before writing the new export",
          })}
        />
        {translate("Overwrite existing files in the output folder")}
      </label>
      <p className="deployment-action-reason">
        {translate(
          "Off by default. The exporter refuses to write into a non-empty folder unless this is checked — it never deletes unknown files silently."
        )}
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => void controller.trigger()}
        {...agentHandle("deployment-static-site-export-build", {
          role: "button",
          label: "Start a static export from this admin server, using the checkbox above's overwrite setting",
        })}
      >
        {busy ? translate("Exporting…") : translate("Build static export")}
      </button>
      {controller.triggerError ? (
        <p className="save-error" role="alert">
          {controller.triggerError}
        </p>
      ) : null}
      {controller.pollError ? (
        <p
          className="notice warning"
          role="status"
          {...agentHandle("deployment-static-site-export-poll-error", {
            role: "status",
            label: "States that this export's status could no longer be checked, so the button re-enabled even though the run may still be in progress",
          })}
        >
          {controller.pollError}
        </p>
      ) : null}
      {controller.run ? <ExportRunResult run={controller.run} t={translate} /> : null}
    </div>
  );
}

/** One provider's CLI-first row inside the selected target's route block — real name/command, a
 *  real detected/not-detected pill from `deployClis` (or "Checking…" while the Overview snapshot is
 *  still loading), its own description, and its own single-tool "ask the assistant" copy line. Never
 *  renders the OTHER provider's tool — see this file's header for why that split matters.
 *
 *  The copy line is derived from the SAME `installed` boolean the pill renders, via
 *  {@link publishAssistantRequest} — see that function's doc for the contradiction this closes
 *  (a row reading "Detected on this server" while offering "Install the GitHub CLI…" to copy).
 *  `targetLabel` is threaded in for the detected-state sentence, which names the destination; it
 *  comes from the caller's already-resolved `selectedTarget`, since the tool→target relation is 1:1
 *  through `StaticPublishTargetInfo.cliToolId` and re-deriving it here would be a second lookup of
 *  a fact the caller already holds. */
function ProviderCliRow({
  tool,
  targetLabel,
  deployClis,
  overviewLoaded,
  t: translate,
}: {
  tool: PublishCliTool;
  targetLabel: string;
  deployClis: readonly AdminDeployCliStatus[];
  overviewLoaded: boolean;
  t: Translate;
}) {
  const installed = cliInstalledStatus(deployClis, tool.id);
  return (
    <div className="deployment-provider-list-item">
      <span className="deployment-provider-name">
        <span translate="no">{tool.name}</span>
        <span className="deployment-tool-command" translate="no">
          {tool.command}
        </span>
        {overviewLoaded ? (
          <span className={`status status-${installed ? "ok" : "neutral"}`}>
            {installed ? translate("Detected on this server") : translate("Not detected on this server")}
          </span>
        ) : (
          <span className="status status-neutral">{translate("Checking…")}</span>
        )}
      </span>
      <p>{translate(tool.descriptionKey)}</p>
      <CopyLine
        text={publishAssistantRequest(tool, targetLabel, installed)}
        prose
        copyLabel={translate("Copy")}
        copiedLabel={translate("Copied!")}
        copyAccessibleName={translate(`Copy this request to the assistant (${tool.name})`)}
        agentHandleId={`deployment-static-site-assistant-request-copy-${tool.id}`}
      />
    </div>
  );
}

export interface StaticSiteTabProps {
  /** DI seams for tests — same convention as every other wired-hook prop in this app
   *  (`DockerfileTabProps.useDockerfileSourceHook`, `OverviewTabProps.useDeploymentOverviewHook`). */
  useStaticExportHook?: typeof useWiredStaticExport;
  useStaticPublishHook?: typeof useWiredStaticPublish;
  useDeploymentOverviewHook?: typeof useWiredDeploymentOverview;
  usePublishCredentialsHook?: typeof useWiredPublishCredentials;
}

/** Resolves each of {@link StaticSiteTabProps}'s four DI seams to its real hook when a caller
 *  passes none — four small resolvers rather than four inline `??` expressions in
 *  `StaticSiteTab` itself, same complexity-gate reasoning `OverviewTab.tsx`'s own
 *  `resolveDeploymentOverviewHook` documents (a resolver here counts one branch each; four inline
 *  `??`s in the component body would count four against ITS OWN score instead). */
function resolveStaticExportHook(override: typeof useWiredStaticExport | undefined): typeof useWiredStaticExport {
  return override ?? useWiredStaticExport;
}
function resolveStaticPublishHook(override: typeof useWiredStaticPublish | undefined): typeof useWiredStaticPublish {
  return override ?? useWiredStaticPublish;
}
function resolveDeploymentOverviewHookForStaticSite(
  override: typeof useWiredDeploymentOverview | undefined
): typeof useWiredDeploymentOverview {
  return override ?? useWiredDeploymentOverview;
}
function resolvePublishCredentialsHook(
  override: typeof useWiredPublishCredentials | undefined
): typeof useWiredPublishCredentials {
  return override ?? useWiredPublishCredentials;
}

export function StaticSiteTab(props: StaticSiteTabProps) {
  const locale = useAdminLocale();
  const translate = (key: string): string => t(locale, key);

  const useStaticExportHook = resolveStaticExportHook(props.useStaticExportHook);
  const useStaticPublishHook = resolveStaticPublishHook(props.useStaticPublishHook);
  const useDeploymentOverviewHook = resolveDeploymentOverviewHookForStaticSite(props.useDeploymentOverviewHook);
  const usePublishCredentialsHook = resolvePublishCredentialsHook(props.usePublishCredentialsHook);

  const exportController = useStaticExportHook();
  const publishController = useStaticPublishHook();
  const overview = useDeploymentOverviewHook();
  const credentialsController = usePublishCredentialsHook();

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

      <BuildExportCard controller={exportController} t={exportController.t} />

      <GettingItOnlineCard
        publishController={publishController}
        overview={overview}
        credentialsController={credentialsController}
        t={publishController.t}
      />
    </div>
  );
}

/** The "Getting it online" card — a provider picker (GitHub Pages, Vercel, Netlify, Cloudflare
 *  Pages), that provider's own CLI-first recommendation (github-pages/vercel only — see
 *  `StaticPublishTargetInfo.cliToolId`'s doc), and that provider's own preview+publish mini-form.
 *  Composed as its own function (not inline in `StaticSiteTab`) for the same complexity-gate reason
 *  `Deployment.tsx`'s `deploymentTabPanel` documents — this card alone owns the CLI-tool-or-not
 *  branch plus the four-target field sets `StaticPublishTargetFields` renders.
 *
 *  `t` is `publishController.t` (the injected hook's own bound translator), not a second one built
 *  from `useAdminLocale()` — same "the DI seam has to actually be exercised" reasoning
 *  `use-deployment-overview.unit.test.tsx`'s own "proving the value isn't built internally" test
 *  pins for `OverviewTab`. `overview` supplies only DATA (`deployClis`) here, never its own `t` —
 *  one card, one translator, so a test injecting a fake `useStaticPublishHook` controls every string
 *  this card renders without also needing to fake the Overview hook's locale plumbing. */
function GettingItOnlineCard({
  publishController,
  overview,
  credentialsController,
  t: translate,
}: {
  publishController: StaticPublishController;
  overview: DeploymentOverviewController;
  credentialsController: PublishCredentialsController;
  t: Translate;
}) {
  const selectedTarget = STATIC_PUBLISH_TARGETS.find((target) => target.id === publishController.target) ?? STATIC_PUBLISH_TARGETS[0]!;
  // `undefined` for Netlify/Cloudflare Pages (no CLI this codebase drives — see
  // `StaticPublishTargetInfo.cliToolId`'s own doc) — deliberately NOT resolved with a `?? PUBLISH_CLI_TOOLS[0]`
  // fallback, which would silently recommend the GitHub CLI for a Netlify selection. `selectedTool`
  // stays `undefined` and the CLI-first block below renders its own explicit "no CLI path" note instead.
  const selectedTool = selectedTarget.cliToolId !== undefined ? PUBLISH_CLI_TOOLS.find((tool) => tool.id === selectedTarget.cliToolId) : undefined;
  const deployClis = overview.snapshot?.deployClis ?? [];

  function handleTargetChange(id: string) {
    const next = STATIC_PUBLISH_TARGETS.find((target) => target.id === id);
    if (next) publishController.setTarget(next.id);
  }

  // One `Set` lookup per render, not a `.find()` inside the `.map()` below — `rows` is at most four
  // (soon five) entries, so the difference is not about speed, it is about keeping the connected
  // check a single small expression the `tabs` map stays readable with. `undefined` (rows not
  // loaded yet) reads as "nothing connected yet" rather than a loading state of its own — a tab dot
  // popping in a beat after the tab bar itself is the same acceptable one-render lag `overviewLoaded`
  // already tolerates on `ProviderCliRow`'s own "Checking…" pill just below.
  const connectedProviderIds = new Set((credentialsController.rows ?? []).filter((row) => row.saved !== undefined).map((row) => row.providerId));

  return (
    <div
      className="card"
      {...agentHandle("deployment-static-site-online-card", {
        role: "region",
        label: "Publish target picker, CLI-first recommendation, and direct preview/publish form for this static export",
      })}
    >
      <div className="card-head">
        <h2 className="card-title">{translate("Getting it online")}</h2>
      </div>
      <div className="deployment-card-body">
        {publishController.loadError ? (
          <p
            className="notice error"
            role="status"
            {...agentHandle("deployment-static-site-publish-load-error", {
              role: "status",
              label: "Shows the error when this publish's current status could not be loaded",
            })}
          >
            {publishController.loadError}
          </p>
        ) : null}
        <p className="card-lead">
          {translate(
            "The export is just a folder of files. Pick where it goes, then either let the assistant drive the CLI or publish straight from here."
          )}
        </p>

        <TabBar
          ariaLabel={translate("Publish target")}
          tabs={STATIC_PUBLISH_TARGETS.map((target) => ({
            id: target.id,
            label: target.label,
            dot: connectedProviderIds.has(target.id),
            dotLabel: translate("Connected"),
          }))}
          activeId={selectedTarget.id}
          onChange={handleTargetChange}
        />

        {selectedTool ? (
          <>
            <div className="deployment-route deployment-route-quiet">
              <div className="deployment-route-label">
                <AssistantIcon size={16} />
                <span className="deployment-fact-label">{translate("Fastest — ask the assistant")}</span>
              </div>
              {/* State-NEUTRAL wording. This used to read "once this tool is installed it can
                  publish the export for you", which quietly presumed the not-installed case and sat
                  directly above a row that may well say "Detected on this server" — the same
                  install-when-already-installed contradiction `publishAssistantRequest` fixes in the
                  copy line below, in prose form. Phrasing it as a capability rather than a
                  precondition is true in BOTH states, so this line needs no branch of its own (and
                  this card has no complexity budget to spend on one — see the gate note in
                  `eslint.config.mjs`). */}
              <p className="deployment-action-reason">
                {translate(
                  "Tovu's assistant runs as a command-line coding agent with its own shell, so it can drive this tool to publish the export for you — nothing to paste here, and no credentials stored."
                )}
              </p>
              <ul className="deployment-provider-list">
                <ProviderCliRow
                  tool={selectedTool}
                  targetLabel={selectedTarget.label}
                  deployClis={deployClis}
                  overviewLoaded={Boolean(overview.snapshot)}
                  t={translate}
                />
              </ul>
            </div>
            {/* Names the CLI block above and the numbered flow below as ALTERNATIVES, not two steps
                of one sequence — without it, "Connect GitHub Pages" reads like the thing you do
                right after installing the CLI, when it is really the other option entirely. Plain
                text, not `.deployment-route*`: a divider is not a block with its own content, and
                giving it a box would make it look like a third choice rather than the seam between
                the two real ones. */}
            <p className="deployment-route-divider">{translate("or")}</p>
          </>
        ) : null}

        <PublishCredentialsSection controller={credentialsController} selectedProviderId={selectedTarget.id} t={translate} />
        <ManageAccessTokensLink t={translate} />

        <StaticPublishForm
          target={selectedTarget.id}
          controller={publishController}
          credentialChangePending={credentialsController.credentialChangePending}
          chosenCredentialId={chosenCredentialIdForTarget(credentialsController, selectedTarget.id)}
          t={translate}
        />
      </div>
    </div>
  );
}

/**
 * Cross-link from this tab's single-token-per-provider credential row to the fuller Access Tokens
 * tab on the Security page — the owner's own ask, verbatim: "a button 'create access token' that
 * takes them back to the access token tab on the security page." This tab's own row above still
 * handles the common case inline (one token per provider, paste-and-save) — {@link
 * PublishCredentialsSection} is deliberately UNCHANGED by this link, per the standing "Static Site
 * stays as-is for now" decision (`ADS-memory/reports/2026-08-17-source-control-ui.md`). This is the
 * escape hatch to what Security's Access Tokens tab can do that this row cannot: save a SECOND named
 * token for the same provider, rename one, or remove one — `AccessTokensTab.tsx`'s own header on
 * why "Create" living there too is not a duplicate of what this tab does.
 *
 * One link per card, not one per provider — clicking it always lands on the same destination
 * regardless of which of the four tabs is currently selected, so it renders once beneath the
 * credential section rather than being threaded through {@link PublishCredentialFields} four times.
 * Plain `navigate()`, not `{ replace: true }` — this is a real navigation to a different page (the
 * reader may want the Back button to return here), unlike this tab's own `handleTabChange`-style
 * calls, which only swap a `?tab=` query param on the SAME page.
 * @complexity O(1) — no branches.
 */
function ManageAccessTokensLink({ t: translate }: { t: Translate }) {
  return (
    <p className="deployment-action-reason">
      {translate("Need to save more than one token, rename one, or manage every saved credential in one place?")}{" "}
      <button
        type="button"
        className="link-button"
        onClick={() => navigate("/access-tokens?tab=access-tokens")}
        {...agentHandle("deployment-static-site-manage-tokens-link", {
          role: "button",
          label: "Go to the Access Tokens tab on the Security page to create, rename, or manage saved tokens",
        })}
      >
        {translate("Create access token")}
      </button>
    </p>
  );
}

/**
 * {@link PublishCredentialsSection}'s four state branches (load error, still loading, not-yet-
 * connected, connected), pulled into its own function so wrapping them in one shared region tag
 * doesn't add a branch to `PublishCredentialsSection` itself — same "extract rather than inline"
 * pattern {@link credentialStepSubtitleKey} already uses in this file for the same complexity-gate
 * reason (`eslint.config.mjs`'s per-scope cap, `noInlineConfig` on so a disable comment cannot buy
 * the room back).
 */
function publishCredentialsSectionContent({
  controller,
  selectedProviderId,
  t: translate,
}: {
  controller: PublishCredentialsController;
  selectedProviderId: AdminStaticPublishTargetId;
  t: Translate;
}) {
  if (controller.loadError) {
    return (
      <p
        className="notice error"
        role="status"
        {...agentHandle("deployment-static-site-credentials-load-error", {
          role: "status",
          label: "Shows the error when saved publish credentials could not be loaded",
        })}
      >
        {controller.loadError}
      </p>
    );
  }

  if (controller.rows === undefined || controller.executionMode === undefined) {
    return <p className="deployment-action-reason">{translate("Loading credentials…")}</p>;
  }

  const row = controller.rows.find((r) => r.providerId === selectedProviderId);
  if (!row) return null;

  if (row.saved !== undefined) {
    return <CredentialStepDone row={row} controller={controller} t={translate} />;
  }
  return <CredentialStepTodo row={row} controller={controller} executionMode={controller.executionMode} t={translate} />;
}

/**
 * The credential step — Step 1 of the two-step flow this card walks a reader through (Step 2 is
 * {@link StaticPublishForm}'s "Where this publish goes"), for whichever provider is currently
 * selected on the tab bar above. Renders exactly one provider's state: {@link CredentialStepTodo}
 * when nothing is saved yet, {@link CredentialStepDone} once it is.
 *
 * Three passes got this section here. First, "'Add credential' should be gone. Just list the
 * providers, labels, and access token space, and that's it" (2026-08-15) replaced an add/edit/delete
 * flow with one always-visible row per provider. Then "it looks just awful" (2026-08-16) — all four
 * rows rendered at once regardless of the selected tab — collapsed it to the SELECTED provider's row
 * only. Then the owner's OWN direct read of that result: **"Advanced" is backwards for a mandatory
 * first step.** A new user cannot publish anything through this form until a token is saved here —
 * it is step one of two, not an optional extra — and the only reason it had ever been hidden behind
 * an "Advanced" disclosure was that four stacked forms were too ugly to leave visible. The collapse
 * removed that reason, so this pass removes the hiding along with it: disclosure now depends on
 * `row.saved` (has this actually been done), never on `controller.executionMode` (the OLD gate).
 * `executionMode` still matters — it changes WHY this step is mandatory, in
 * {@link credentialStepSubtitleKey} — just not WHETHER it is shown open.
 *
 * `PUBLISH_CREDENTIAL_PROVIDERS`/`STATIC_PUBLISH_TARGETS` share the same id set in the same order
 * (`rules.ts`'s own doc on both), so `selectedProviderId` — always one of `STATIC_PUBLISH_TARGETS`'s
 * own ids — is guaranteed to match exactly one row; the `undefined` fallback in
 * {@link publishCredentialsSectionContent} is defensive only.
 *
 * Renders only a brief "Loading…" line until BOTH `rows` and `executionMode` have resolved — showing
 * either step state for one render before the real data arrives would be a worse false impression
 * than a short, honest wait.
 *
 * Wraps whichever of the four states above is current in ONE `data-agent-element` region tag
 * (`deployment-static-site-credentials-section`), present in EVERY state rather than only some —
 * an agent-tagging assertion once covered this and quietly stopped matching anything the moment this
 * function grew four different top-level return shapes with no shared wrapper (caught 2026-08-15,
 * restored same day). This tag is not decorative: the coming repo picker (replacing the manual
 * `owner`/`repo` inputs) is meant to be driven by the assistant reading this page through
 * `data-agent-element`/`agentHandle()` tagging rather than a bespoke API, and a region that vanishes
 * in three states out of four is worse than no region at all — an agent reading the page cannot tell
 * "not on this page" from "not in this state". The wrapping `<div>` carries no class and no styles of
 * its own on purpose — it is a tag, not a layout primitive, and `.deployment-card-body`'s flex `gap`
 * (`styles.css`) already spaces this section correctly against its siblings regardless of what sits
 * one level inside it, so adding a box here would only be a second, redundant one around whichever
 * of {@link CredentialStepTodo}/{@link CredentialStepDone} already draws its own.
 */
function PublishCredentialsSection(props: {
  controller: PublishCredentialsController;
  selectedProviderId: AdminStaticPublishTargetId;
  t: Translate;
}) {
  return (
    <div
      {...agentHandle("deployment-static-site-credentials-section", {
        role: "region",
        label: "The selected provider's saved publish credential — connect or replace flow",
      })}
    >
      {publishCredentialsSectionContent(props)}
    </div>
  );
}

/** Step 1's subtitle key — explains why connecting here is necessary, which depends on
 *  `executionMode` (the server's own fact about whether this WORKSPACE can reach the operator's
 *  terminal at all — see `AdminPublishExecutionMode`'s doc in `lib/api.ts`), not on whether the
 *  currently selected PROVIDER happens to have a CLI route. `"self-hosted-cli"` covers a workspace
 *  where some other provider's CLI works even when this one has none, and the reason to connect
 *  here is the same regardless: it is the only path this specific provider has. */
function credentialStepSubtitleKey(executionMode: AdminPublishExecutionMode): string {
  if (executionMode === "hosted-api-only") {
    return "This workspace can't use your computer's terminal — connecting here is the only way to publish.";
  }
  return "Save a personal access token so Tovu can publish on your behalf.";
}

/**
 * Step 1's fields — token input, Cloudflare Pages' required Account ID, and the Save action. Shared
 * between {@link CredentialStepTodo} (always open) and {@link CredentialStepDone} (one click away,
 * for replacing an already-saved token) rather than duplicated, since the fields and the Save
 * behavior are identical in both — only whether the reader sees them by default differs.
 *
 * Every hint here renders BELOW its input as a `.field-hint`, never as placeholder text inside it —
 * grey placeholder text sitting in an empty box reads as a saved value at a glance, which was the
 * owner's own "why is the access token prepopulated for Netlify and Cloudflare" complaint about this
 * section's earlier shape. The token and Account ID inputs below carry NO `placeholder` prop at all,
 * connected or not — an empty box always looks empty.
 *
 * Fields render in a single stacked column (`.deployment-credential-fields`), NOT the shared
 * `.field-row` two-up grid every target-config field set on this tab uses — that grid gives both
 * columns of a row the SAME height, and Cloudflare Pages' own two fields never have the same height
 * (Access token carries two hint lines plus a link; Account ID carries one short hint). A single
 * column can't break this way regardless of field count — see this file's header for the Custom/S3
 * provider (~5 fields) this same layout will need to hold once it lands.
 */
function PublishCredentialFields({
  row,
  controller,
  t: translate,
}: {
  row: PublishCredentialRowState;
  controller: PublishCredentialsController;
  t: Translate;
}) {
  const info = publishCredentialProviderInfo(row.providerId);
  const connected = row.saved !== undefined;
  const fields: PublishCredentialFormFields = { providerId: row.providerId, token: row.token, accountId: row.accountId };
  const readyToSave = publishCredentialRowReadyToSave(fields);
  const needsAccountId = info.requiredFields.includes("accountId");

  return (
    <>
      <div className="deployment-credential-fields">
        <div className="field">
          <label className="field-label" htmlFor={`deployment-static-site-credentials-token-${row.providerId}`}>
            {translate("Access token")}
          </label>
          <input
            id={`deployment-static-site-credentials-token-${row.providerId}`}
            type="password"
            // `new-password`, not `off` — Chrome ignores `off` on credential-shaped fields by
            // design. See `security/AccessTokensTab.tsx`'s token input for the full reasoning.
            autoComplete="new-password"
            value={row.token}
            onChange={(e) => controller.setToken(row.providerId, e.target.value)}
            {...agentHandle(`deployment-static-site-credentials-token-${row.providerId}`, {
              role: "field",
              label: `${info.label} access token — stored encrypted, never shown again once saved`,
            })}
          />
          <p className="field-hint">
            {connected
              ? translate("Leave blank to keep the current token.")
              : translate("Stored encrypted on the server. Once saved, Tovu never displays it again.")}
          </p>
          <p className="field-hint">
            {translate(info.scopeGuidanceKey)}{" "}
            <a
              href={info.tokenPageUrl}
              target="_blank"
              rel="noreferrer"
              {...agentHandle(`deployment-static-site-credentials-token-page-${row.providerId}`, {
                role: "link",
                label: `Open ${info.label}'s own page for creating a personal access token`,
              })}
            >
              {translate("Create a token")}
            </a>
          </p>
        </div>

        {needsAccountId ? (
          <div className="field">
            <label className="field-label" htmlFor={`deployment-static-site-credentials-account-${row.providerId}`}>
              {translate("Account ID")}
            </label>
            <input
              id={`deployment-static-site-credentials-account-${row.providerId}`}
              type="text"
              value={row.accountId}
              onChange={(e) => controller.setAccountId(row.providerId, e.target.value)}
              {...agentHandle(`deployment-static-site-credentials-account-${row.providerId}`, {
                role: "field",
                label: "Cloudflare account id — required, Cloudflare cannot resolve a project without it",
              })}
            />
            <p className="field-hint">{translate("Shown on your Cloudflare dashboard's own sidebar.")}</p>
          </div>
        ) : null}
      </div>

      <div className="deployment-action">
        <button
          type="button"
          disabled={!readyToSave || row.saving}
          onClick={() => void controller.save(row.providerId)}
          {...agentHandle(`deployment-static-site-credentials-save-${row.providerId}`, {
            role: "button",
            label: `Save the ${info.label} access token`,
          })}
        >
          {row.saving ? translate("Saving…") : translate("Save")}
        </button>
        {row.error ? (
          <p className="save-error" role="alert">
            {row.error}
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * Step 1, not-yet-connected — open and prominent, no "Advanced" framing anywhere (the owner's own
 * redirect; see {@link PublishCredentialsSection}'s doc for the full story). Plain fields, not a
 * `<details>`: there is nothing to progressively disclose FROM here, since this IS the thing the
 * reader still has to do — hiding the one remaining blocking step behind a click would recreate the
 * exact problem this pass exists to fix.
 */
function CredentialStepTodo({
  row,
  controller,
  executionMode,
  t: translate,
}: {
  row: PublishCredentialRowState;
  controller: PublishCredentialsController;
  executionMode: AdminPublishExecutionMode;
  t: Translate;
}) {
  const info = publishCredentialProviderInfo(row.providerId);
  return (
    <div
      className="deployment-step"
      {...agentHandle(`deployment-static-site-credentials-row-${row.providerId}`, {
        role: "region",
        label: `${info.label}'s saved publish credential — not yet connected`,
      })}
    >
      <div className="deployment-step-head">
        <span className="deployment-step-marker" aria-hidden="true">
          1
        </span>
        <div className="deployment-step-headings">
          <h3 className="deployment-step-title">
            {translate("Connect")} <span translate="no">{info.label}</span>
          </h3>
          <p className="deployment-step-subtitle">{translate(credentialStepSubtitleKey(executionMode))}</p>
        </div>
      </div>
      <PublishCredentialFields row={row} controller={controller} t={translate} />
    </div>
  );
}

/**
 * Step 1, connected — collapsed to one settled summary line behind a native `<details>` (same
 * disclosure affordance this admin already uses elsewhere — `Redirects.tsx`'s bulk-import panel,
 * `AiAssistant.tsx`'s roadmap accordion — rather than a second, JS-driven one), CLOSED by default:
 * the step is done, so it gets out of the way, the mirror image of {@link CredentialStepTodo}
 * staying open because its step is NOT done.
 *
 * The summary states the trust fact directly — "token stored, encrypted" — rather than leaving
 * "Connected" to imply it. The owner's own framing: a user pasting a real access token into this box
 * has to decide whether to believe it is actually being protected, and this admin can back the claim
 * — `publish_credential_sets` has no plaintext token column at all, only `sealed_ciphertext`/
 * `sealed_nonce`/`sealed_alg` (AES-GCM). This says only what is true and checkable from the UI's own
 * side of that boundary ("stored, encrypted"), not the specific cipher — the algorithm is an
 * implementation detail the interface has no business asserting and no way to keep honest if the
 * server ever changes it.
 *
 * Expanding the summary re-shows {@link PublishCredentialFields} to replace the token — the exact
 * fields {@link CredentialStepTodo} shows, just reached one click away rather than always open,
 * since changing an already-working credential is the rare path, not the common one.
 *
 * The summary row carries a visible "Replace token" label plus {@link DisclosureChevron} at its END
 * (owner-reported, 2026-08-15: the row was clickable but nothing on screen said so, and a reader with
 * a rotated token had no way to discover this row opens to a fresh token field). Placed at the end,
 * not the start: the step marker already occupies the start, and a second unstyled glyph there would
 * recreate the exact "which glyph means what" confusion the `::-webkit-details-marker` reset (see
 * `.deployment-step-summary` in `styles.css`) exists to avoid — a text label plus a chevron reads as
 * one clear affordance instead. `.deployment-step-summary-text` carries `flex: 1` so this action is
 * pushed to the row's far edge rather than trailing the timestamp mid-row.
 *
 * The timestamp reads "saved", never "updated": it is the moment this ROW was written, not a
 * liveness check — a revoked token still shows this same timestamp, and re-verifying (below) never
 * touches it. "updated" implied a recency the UI cannot back up from `saved` alone.
 *
 * ## Verify (2026-08-16 — closes a real gap, corrects this doc's own earlier "out of scope" call)
 *
 * An earlier pass of this doc said a verification indicator was "explicitly out of scope for this
 * row" — that held only until the assistant's own capability tool (`deployment_get_static_publish_
 * capabilities`) started telling a human to come HERE and "hit verify on the token" whenever its
 * cached verification went cold (e.g. a server restart — `InMemoryPublishCredentialVerificationCache`
 * has no persistence), and grepping this file for "verify" turned up nothing to click (see
 * `development/e2e/deployment-static-site-verify-gap.spec.ts`'s header for the full live-reproduction
 * chain). `POST .../credentials/:id/verify` (`publish-credentials.ts`) already existed and worked; the
 * gap was UI wiring only. {@link CredentialVerifyAction} closes it — a real re-check button living
 * inside `<summary>` itself (not the `<details>` content revealed on expand), because it has to stay
 * reachable while this row is collapsed, its normal resting state; see that component's own doc for
 * why a nested `<button>` there needs its click prevented from also toggling the details.
 *
 * A `"valid"` result carrying an `accountLabel` is durable — `usePublishCredentials`'s `verify` mirrors
 * the server's own `healAccountLabel` write onto `row.saved.accountLabel` immediately, which is what
 * lets the summary line below show "connected as X" even after a page reload, long after any single
 * verify RESPONSE (transient, session-only) is gone. That durability is the whole point: an operator
 * who verifies once should not have to re-verify again just to keep seeing which account this token
 * belongs to.
 */
function CredentialStepDone({
  row,
  controller,
  t: translate,
}: {
  row: PublishCredentialRowState;
  controller: PublishCredentialsController;
  t: Translate;
}) {
  const info = publishCredentialProviderInfo(row.providerId);
  return (
    <details
      className="deployment-step deployment-step-done"
      {...agentHandle(`deployment-static-site-credentials-row-${row.providerId}`, {
        role: "region",
        label: `${info.label}'s saved publish credential — connected`,
      })}
    >
      <summary className="deployment-step-summary">
        <span className="deployment-step-marker deployment-step-marker-done" aria-hidden="true">
          <StepDoneIcon />
        </span>
        <span className="deployment-step-summary-text">
          <span translate="no">{info.label}</span> {translate("connected")} · {translate("token stored, encrypted")} ·{" "}
          {translate("saved")} {formatTimestamp(row.saved!.updatedAt)}
          {row.saved!.accountLabel ? (
            <>
              {" "}
              · {translate("connected as")} <span translate="no">{row.saved!.accountLabel}</span>
            </>
          ) : null}
        </span>
        <CredentialVerifyAction row={row} controller={controller} t={translate} />
        <span className="deployment-step-summary-action">
          {translate("Replace token")}
          <DisclosureChevron />
        </span>
      </summary>
      <CredentialTokenPicker row={row} controller={controller} t={translate} />
      <PublishCredentialFields row={row} controller={controller} t={translate} />
    </details>
  );
}

/**
 * The "Verify" control on an already-connected row — re-checks the saved token against its real
 * provider right now (`PublishCredentialsController.verify`) and shows the outcome inline: the
 * provider's own message on success (a normal `"valid"`/`"invalid"`/`"unreachable"` result — see
 * `AdminPublishCredentialVerification.status`'s doc for why none of the three is treated as an
 * error), or a translated transport-failure message if the request itself never reached the server.
 *
 * Lives inside `<summary>`, a descendant of the native disclosure toggle, which means its click would
 * otherwise ALSO open/close the enclosing `<details>` (the browser runs `<summary>`'s toggle as the
 * click event's default action regardless of which descendant was actually clicked, unless that
 * default action is cancelled) — `preventDefault`/`stopPropagation` in the handler below is what
 * keeps a Verify click from also expanding the row every time.
 * @complexity O(1) — one button, one derived status line.
 */
function CredentialVerifyAction({
  row,
  controller,
  t: translate,
}: {
  row: PublishCredentialRowState;
  controller: PublishCredentialsController;
  t: Translate;
}) {
  const info = publishCredentialProviderInfo(row.providerId);
  const statusText = row.verifyError ?? row.verification?.message ?? null;
  return (
    <span className="deployment-step-verify">
      <button
        type="button"
        className="btn-secondary"
        disabled={row.verifying}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void controller.verify(row.providerId);
        }}
        {...agentHandle(`deployment-static-site-credentials-verify-${row.providerId}`, {
          role: "button",
          label: `Re-check the saved ${info.label} token against its real provider right now`,
        })}
      >
        {row.verifying ? translate("Verifying…") : translate("Verify")}
      </button>
      {statusText ? (
        <span aria-live="polite" className={credentialVerifyStatusClass(row)}>
          {statusText}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The "which saved token publishes" picker (the owner's own original ask, per
 * `use-publish-credentials.hooks.ts`'s `credentialsForProvider` doc: "GitHub pages... will have a
 * dropdown where you can choose which GitHub access tokens"). Renders nothing when this provider has
 * at most one saved connection — the common case — since there is nothing to choose between; a lone
 * credential is already what {@link CredentialStepDone}'s summary line describes, and a picker with
 * one option would just repeat that fact as a control.
 *
 * Selecting an option promotes that credential to this provider's DEFAULT (`controller.selectCredential`),
 * the exact row a real publish uses (`defaultCredentialForProvider`'s own doc) — there is no separate
 * "which token does this publish use" setting anywhere else for this to drift from.
 * @complexity O(n) in this provider's own (small) saved-credential count, same bound
 *   {@link credentialsForProvider} documents.
 */
function CredentialTokenPicker({
  row,
  controller,
  t: translate,
}: {
  row: PublishCredentialRowState;
  controller: PublishCredentialsController;
  t: Translate;
}) {
  const options = controller.credentialsForProvider(row.providerId);
  if (options.length < 2) return null;
  const info = publishCredentialProviderInfo(row.providerId);
  const fieldId = `deployment-static-site-credentials-picker-${row.providerId}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={fieldId}>
        {translate("Which saved token publishes")}
      </label>
      <select
        id={fieldId}
        value={row.selectingCredentialId ?? row.saved?.id ?? ""}
        disabled={row.selectingCredentialId !== null}
        onChange={(e) => void controller.selectCredential(row.providerId, e.target.value)}
        {...agentHandle(fieldId, {
          role: "field",
          label: `Choose which of this workspace's saved ${info.label} tokens is the one Tovu publishes with`,
        })}
      >
        {options.map((credential) => (
          <option key={credential.id} value={credential.id}>
            {(credential.accountLabel ?? credential.label) + " — " + formatTimestamp(credential.updatedAt)}
          </option>
        ))}
      </select>
      <p className="field-hint">
        {translate("This workspace has more than one saved")} <span translate="no">{info.label}</span>{" "}
        {translate("token. Pick which one Tovu publishes with.")}
      </p>
      {row.selectError ? (
        <p className="save-error" role="alert">
          {row.selectError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * {@link StaticPublishForm}'s per-target field block — one case per {@link AdminStaticPublishTargetId},
 * mirroring {@link PublishCredentialProviderFields}'s "render exactly one provider's fields" rule
 * just above. GitHub Pages shows owner/repo/branch; Vercel shows its optional team id; Netlify and
 * Cloudflare Pages render nothing here at all — neither carries a target-specific field (see
 * `AdminStaticPublishConfig`'s own doc in `lib/api.ts`) — but each still gets its OWN case rather
 * than falling into a shared `default: return null`, so a fifth target added later must be given an
 * explicit answer instead of silently reusing "renders nothing".
 */
function StaticPublishTargetFields({
  target,
  controller,
  t: translate,
}: {
  target: AdminStaticPublishTargetId;
  controller: StaticPublishController;
  t: Translate;
}) {
  if (target === "github-pages") {
    return (
      <>
        <div className="field">
          <label className="field-label" htmlFor="deployment-static-site-publish-owner">
            {translate("GitHub owner or org")}
          </label>
          <input
            id="deployment-static-site-publish-owner"
            type="text"
            value={controller.owner}
            onChange={(e) => controller.setOwner(e.target.value)}
            {...agentHandle("deployment-static-site-publish-owner", { role: "field", label: "GitHub owner or organization login to publish under" })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="deployment-static-site-publish-repo">
            {translate("Repository")}
          </label>
          <input
            id="deployment-static-site-publish-repo"
            type="text"
            value={controller.repo}
            onChange={(e) => controller.setRepo(e.target.value)}
            {...agentHandle("deployment-static-site-publish-repo", { role: "field", label: "GitHub repository name — also determines the published base path" })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="deployment-static-site-publish-branch">
            {translate("Branch (optional)")}
          </label>
          <input
            id="deployment-static-site-publish-branch"
            type="text"
            value={controller.branch}
            onChange={(e) => controller.setBranch(e.target.value)}
            placeholder="gh-pages"
            {...agentHandle("deployment-static-site-publish-branch", { role: "field", label: "GitHub Pages publish branch, defaults to gh-pages when left blank" })}
          />
        </div>
      </>
    );
  }
  if (target === "vercel") {
    return (
      <div className="field">
        <label className="field-label" htmlFor="deployment-static-site-publish-team">
          {translate("Vercel team (optional)")}
        </label>
        <input
          id="deployment-static-site-publish-team"
          type="text"
          value={controller.teamId}
          onChange={(e) => controller.setTeamId(e.target.value)}
          {...agentHandle("deployment-static-site-publish-team", { role: "field", label: "Vercel team id, optional" })}
        />
      </div>
    );
  }
  if (target === "netlify") return null;
  if (target === "cloudflare-pages") return null;
  // Exhaustiveness guard: a fifth `AdminStaticPublishTargetId` value reaching here is a compile
  // error at the call site above, not a silent `undefined` render — same discipline
  // `buildPublishConnectionInput`'s own switch in `rules.ts` relies on.
  const exhaustive: never = target;
  return exhaustive;
}

/** The Preview action — its own component (not inlined in {@link StaticPublishForm}) purely for the
 *  complexity gate: every conditional in this file that renders on `controller.preview*` state used
 *  to accumulate directly in `StaticPublishForm`'s own cyclomatic count, which is what pushed that
 *  function over this repo's complexity convention once `pollError` (below) added one more branch on
 *  top of an already-over-budget function — splitting each `.deployment-action` block out the same
 *  way `PublishPreviewFacts`/`PublishRunResult` already are moves each block's branches into ITS OWN
 *  score instead, same reasoning `resolveStaticExportHook`'s own doc gives for this file's DI
 *  resolvers. No behavior moved, only where the branches are counted. */
function PublishPreviewAction({
  canPreview,
  controller,
  t: translate,
}: {
  canPreview: boolean;
  controller: StaticPublishController;
  t: Translate;
}) {
  return (
    <div className="deployment-action">
      <button
        type="button"
        className="btn-secondary"
        disabled={!canPreview || controller.previewLoading}
        onClick={() => void controller.checkPreview()}
        {...agentHandle("deployment-static-site-publish-preview", { role: "button", label: "Preview what publishing to this target would do, without publishing anything" })}
      >
        {controller.previewLoading ? translate("Checking…") : translate("Preview")}
      </button>
      {controller.previewError ? (
        <p className="save-error" role="alert">
          {controller.previewError}
        </p>
      ) : null}
      {controller.preview ? <PublishPreviewFacts preview={controller.preview} t={translate} /> : null}
    </div>
  );
}

/** The Publish action — status pill, the button itself (gated by {@link busy}), and every terminal
 *  state a publish attempt can end in: a rejected trigger, a poll that gave up ({@link
 *  StaticPublishController.pollError} — see this file's header for why this pass added it here at
 *  all), and a settled run's own result. Split out of {@link StaticPublishForm} for the same
 *  complexity-gate reason {@link PublishPreviewAction} documents. `busy` and `runTone` are passed in
 *  rather than recomputed here — `busy` is `StaticPublishForm`'s own value, read by BOTH the disabled
 *  check below and the button's own label, and computing it twice would let the two drift; `runTone`
 *  is `runStatusTone(controller.run?.status ?? "idle", ...)`, whose own optional-chaining/`??`
 *  operators each count as a branch for this repo's `complexity` rule same as a ternary does — kept
 *  in the parent (mirrors `BuildExportCard` keeping its own `tone` outside `ExportTriggerAction`)
 *  rather than pushing this function back over the 9/9 gate the same way computing it here once did. */
function PublishTriggerAction({
  canPublish,
  busy,
  credentialChangePending,
  chosenCredentialId,
  runTone,
  controller,
  t: translate,
}: {
  canPublish: boolean;
  busy: boolean;
  /** Disables Publish (without relabelling it "Publishing…") while a token switch or replacement is
   *  still in flight — the server would otherwise publish with the token being replaced. */
  credentialChangePending: boolean;
  /** {@link chosenCredentialIdForTarget}'s result — sent with the publish so the SERVER uses this
   *  exact connection rather than resolving its own default. */
  chosenCredentialId: string | undefined;
  runTone: string;
  controller: StaticPublishController;
  t: Translate;
}) {
  return (
    <div className="deployment-action">
      <span className={`status status-${runTone}`}>{translate(publishRunStatusLabelKey(controller.run))}</span>
      <button
        type="button"
        disabled={!canPublish || busy || credentialChangePending}
        onClick={() => void controller.publish(chosenCredentialId !== undefined ? { credentialId: chosenCredentialId } : {})}
        // No agent handle: this publishes the site live with no draft/review step; only a person
        // may press it — see agent-proof-live-buttons pass, same as a022eafaa (Publish confirm).
      >
        {busy ? translate("Publishing…") : translate("Publish")}
      </button>
      <p className="deployment-action-reason">
        {translate("This is immediately live on the public internet once it finishes — there is no draft or review step.")}
      </p>
      {controller.publishError ? (
        <p className="save-error" role="alert">
          {controller.publishError}
        </p>
      ) : null}
      {controller.pollError ? (
        <p
          className="notice warning"
          role="status"
          {...agentHandle("deployment-static-site-publish-poll-error", {
            role: "status",
            label: "States that this publish's status could no longer be checked, so the button re-enabled even though the run may still be in progress",
          })}
        >
          {controller.pollError}
        </p>
      ) : null}
      {controller.run ? <PublishRunResult run={controller.run} t={translate} /> : null}
    </div>
  );
}

/** The token-based preview+publish mini-form for whichever target is currently selected. Reads
 *  ONLY the fields the current target uses (see `use-static-publish.hooks.ts`'s header for why the
 *  hook still keeps all five target fields in state at once) — a GitHub Pages selection never shows
 *  a `teamId` field, and vice versa; Netlify and Cloudflare Pages show neither. */
/** The saved connection this provider's row is currently showing as the one that publishes — the
 *  id the Publish request must NAME, so the server publishes with that account instead of resolving
 *  whichever row is default when the POST lands (terra review 2026-09-20, finding 1). `undefined`
 *  when this provider has no saved connection: an install publishing from server env vars has no
 *  connection ids at all, and that caller keeps the server's default lookup.
 *
 *  Reads `saved` and not `selectingCredentialId`: a pick still in flight is not yet the connection
 *  that publishes, and Publish is disabled for that whole window anyway
 *  ({@link PublishCredentialsController.credentialChangePending}).
 *
 *  @complexity O(providers) — a four-element scan. */
function chosenCredentialIdForTarget(controller: PublishCredentialsController, target: AdminStaticPublishTargetId): string | undefined {
  return controller.rows?.find((row) => row.providerId === target)?.saved?.id;
}

function StaticPublishForm({
  target,
  controller,
  credentialChangePending,
  chosenCredentialId,
  t: translate,
}: {
  target: AdminStaticPublishTargetId;
  controller: StaticPublishController;
  /** {@link PublishCredentialsController.credentialChangePending} — see that field's doc. */
  credentialChangePending: boolean;
  /** {@link chosenCredentialIdForTarget}'s result for this target — see that function's own doc. */
  chosenCredentialId: string | undefined;
  t: Translate;
}) {
  const canPreview = staticPublishFormReadyForPreview(target, { owner: controller.owner, repo: controller.repo });
  const canPublish = staticPublishFormReadyToPublish(target, {
    owner: controller.owner,
    repo: controller.repo,
    projectName: controller.projectName,
  });
  const runTone = runStatusTone(controller.run?.status ?? "idle", controller.run?.result?.ok);
  // `publishing` (the POST-in-flight flag) is included alongside `isPublishing` (the server-confirmed
  // "running" state) on purpose — without it, the window between clicking Publish and the response
  // supplying a "running" run left the button enabled, which is exactly how a double-click could send
  // two POSTs (see `use-static-publish.hooks.ts`'s own `publish()` for the matching in-hook guard —
  // this is the UI half of that same C4 fix, belt-and-suspenders rather than either alone).
  const busy = controller.isPublishing || controller.publishing;
  const projectNameCopy = staticPublishProjectNameCopy(target);

  return (
    <div className="deployment-route">
      <div className="deployment-route-label">
        {/* Step 2's plain numbered marker, not `DestinationIcon` (removed) — a bare "2" reads as
            the second half of the same sequence Step 1's own marker starts, which is exactly the
            "which have I done, what's next" legibility the numbered-step redesign exists for; a
            destination-pin icon paired with Step 1's number-or-checkmark badge would have been two
            different iconographic systems competing for the same job. Never gets a checkmark the
            way a connected credential's marker does — publishing is a repeatable action, not a
            one-time box to tick off. */}
        <span className="deployment-step-marker deployment-step-marker-inline" aria-hidden="true">
          2
        </span>
        <span className="deployment-fact-label">{translate("Where this publish goes")}</span>
      </div>
      <p className="deployment-action-reason">
        {translate(
          "The account above only proves you're allowed to publish — this says exactly where this one goes."
        )}
      </p>

      <div className="field-row">
        <StaticPublishTargetFields target={target} controller={controller} t={translate} />
        <div className="field">
          <label className="field-label" htmlFor="deployment-static-site-publish-project-name">
            {translate(projectNameCopy.labelKey)}
          </label>
          <input
            id="deployment-static-site-publish-project-name"
            type="text"
            value={controller.projectName}
            onChange={(e) => controller.setProjectName(e.target.value)}
            {...agentHandle("deployment-static-site-publish-project-name", {
              role: "field",
              label: `Human-facing label for this publish — ${projectNameCopy.helpKey}`,
            })}
          />
          <p className="deployment-action-reason">{translate(projectNameCopy.helpKey)}</p>
        </div>
      </div>

      <PublishPreviewAction canPreview={canPreview} controller={controller} t={translate} />
      <PublishTriggerAction
        canPublish={canPublish}
        busy={busy}
        credentialChangePending={credentialChangePending}
        chosenCredentialId={chosenCredentialId}
        runTone={runTone}
        controller={controller}
        t={translate}
      />
    </div>
  );
}

/** A preview result's facts — base path (or "root, no prefix" for Vercel/an invalid config) and
 *  whether a credential is configured. Never shows the credential itself — `preview.credentialsConfigured`
 *  is a boolean the server already reduced it to. */
function PublishPreviewFacts({ preview, t: translate }: { preview: AdminStaticPublishPreview; t: Translate }) {
  if (!preview.valid) {
    return (
      <p className="save-error" role="alert">
        {preview.validationError}
      </p>
    );
  }
  return (
    <div className="deployment-facts">
      <div className="deployment-fact">
        <span className="deployment-fact-label">{translate("Base path")}</span>
        <span className="deployment-fact-value">
          {preview.basePath ? <code translate="no">{preview.basePath}</code> : translate("None — serves from the domain root")}
        </span>
      </div>
      <div className="deployment-fact">
        <span className="deployment-fact-label">{translate("Credential")}</span>
        <span className={`status status-${preview.credentialsConfigured ? "ok" : "warning"}`}>
          {preview.credentialsConfigured ? translate("Configured") : translate("Not configured")}
        </span>
      </div>
      {!preview.credentialsConfigured && preview.credentialGuidance ? (
        <p className="deployment-action-reason">{preview.credentialGuidance}</p>
      ) : null}
    </div>
  );
}

/** A publish run's completed/errored detail — the live URL on success, or the failure message. */
function PublishRunResult({ run, t: translate }: { run: AdminPublishRunSnapshot; t: Translate }) {
  if (run.status !== "completed" && run.status !== "errored") return null;
  // `result` can be present at EITHER terminal status — `publish-site.ts`'s own trigger route maps
  // ANY `publishStaticSite` outcome with `ok: false` (bad config, no credential, a rejected provider
  // call) to `status: "errored"`, not `"completed"`; only a route-level exception the route itself
  // never expected (no `result` at all) falls back to the bare `run.error` string. Checking `result`
  // FIRST regardless of `status` is what a naive `status === "errored" -> run.error` branch gets
  // wrong — verified live against a real triggered publish with no credential configured, which
  // settles to `status: "errored"` with a full `result.message`, not an empty `run.error`.
  if (run.result) {
    if (!run.result.ok) {
      return (
        <p className="save-error" role="alert">
          {run.result.message}
        </p>
      );
    }
    return (
      <p className="save-ok">
        {translate("Published:")}{" "}
        <a
          href={run.result.url}
          target="_blank"
          rel="noreferrer"
          translate="no"
          {...agentHandle("deployment-static-site-publish-result-url", { role: "link", label: "Open the just-published site" })}
        >
          {run.result.url}
        </a>
      </p>
    );
  }
  if (run.error) {
    return (
      <p className="save-error" role="alert">
        {run.error}
      </p>
    );
  }
  return null;
}
