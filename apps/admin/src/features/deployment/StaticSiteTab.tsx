import { useState } from "react";
import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { TabBar } from "../../components/TabBar";
import { formatTimestamp } from "../../lib/format-timestamp";
import type {
  AdminDeployCliStatus,
  AdminExportRunSnapshot,
  AdminPublishCredentialProviderId,
  AdminPublishCredentialSummary,
  AdminPublishRunSnapshot,
  AdminStaticPublishPreview,
  AdminStaticPublishTargetId,
} from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { t } from "./deployment-i18n";
import {
  PUBLISH_CREDENTIAL_PROVIDERS,
  STATIC_HOSTS,
  STATIC_PUBLISH_TARGETS,
  STATIC_SITE_CAPABILITIES,
  PUBLISH_CLI_TOOLS,
  cliInstalledStatus,
  credentialsForProvider,
  exportRunStatusLabelKey,
  publishAssistantRequestForTool,
  publishCredentialFormReadyToSubmit,
  publishCredentialProviderInfo,
  publishRunStatusLabelKey,
  runStatusTone,
  staticPublishFormReadyForPreview,
  staticPublishFormReadyToPublish,
  type PublishCliTool,
  type PublishCredentialFormFields,
} from "./rules";
import { AssistantIcon, CapabilityList, StaticSiteIcon } from "./deployment-visuals";
import { useWiredDeploymentOverview } from "./hooks/use-deployment-overview.hooks";
import type { DeploymentOverviewController } from "./hooks/use-deployment-overview.hooks";
import { useWiredStaticExport } from "./hooks/use-static-export.hooks";
import type { StaticExportController } from "./hooks/use-static-export.hooks";
import { useWiredStaticPublish } from "./hooks/use-static-publish.hooks";
import type { StaticPublishController } from "./hooks/use-static-publish.hooks";
import { useWiredPublishCredentials } from "./hooks/use-publish-credentials.hooks";
import type { PublishCredentialsController } from "./hooks/use-publish-credentials.hooks";

/**
 * @file Static Site tab — what a static export produces, a real trigger+poll build action, and a
 * real per-provider publish flow to GitHub Pages/Vercel.
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

/** One export run's completed/errored detail — counts, failures, and where it landed. Only rendered
 *  once `run.status` is `"completed"` or `"errored"`; a `"running"`/`"idle"` run has nothing here yet
 *  to report. */
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
      <div className="deployment-facts">
        <div className="deployment-fact">
          <span className="deployment-fact-label">{translate("Routes")}</span>
          <span className="deployment-fact-value">
            {run.counts.routesSucceeded} {translate("succeeded")}
            {run.counts.routesFailed > 0 ? `, ${run.counts.routesFailed} ${translate("failed")}` : ""}
          </span>
        </div>
        <div className="deployment-fact">
          <span className="deployment-fact-label">{translate("Assets")}</span>
          <span className="deployment-fact-value">
            {run.counts.assetsSucceeded} {translate("succeeded")}
            {run.counts.assetsFailed > 0 ? `, ${run.counts.assetsFailed} ${translate("failed")}` : ""}
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
      {/* The counts above only say HOW MANY routes/assets failed — `failedRoutes`/`failedAssets`
          are the one place this run's own report names WHICH ones and why, so an operator staring
          at "3 failed" has somewhere to look instead of re-running the whole export to find out. */}
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

/** The "Build it from a terminal" card's second half — the command block (unchanged) plus the real
 *  build action: a clean/overwrite checkbox, the Build button itself, a live status pill, and the
 *  run's own result once it settles. */
function BuildExportCard({ controller, t: translate }: { controller: StaticExportController; t: Translate }) {
  const tone = runStatusTone(controller.run?.status ?? "idle", controller.run?.ok);
  const busy = controller.triggering || controller.isRunning;

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
          {controller.run ? <ExportRunResult run={controller.run} t={translate} /> : null}
        </div>
      </div>
    </div>
  );
}

/** One provider's CLI-first row inside the selected target's route block — real name/command, a
 *  real detected/not-detected pill from `deployClis` (or "Checking…" while the Overview snapshot is
 *  still loading), its own description, and its own single-tool "ask the assistant" copy line. Never
 *  renders the OTHER provider's tool — see this file's header for why that split matters. */
function ProviderCliRow({
  tool,
  deployClis,
  overviewLoaded,
  t: translate,
}: {
  tool: PublishCliTool;
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
        text={publishAssistantRequestForTool(tool)}
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

/** The "Getting it online" card — a provider picker (GitHub Pages/Vercel), that provider's own
 *  CLI-first recommendation, and that provider's own preview+publish mini-form. Composed as its own
 *  function (not inline in `StaticSiteTab`) for the same complexity-gate reason `Deployment.tsx`'s
 *  `deploymentTabPanel` documents — this card alone owns a provider `if`/`else` plus two field sets.
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
  const selectedTool = PUBLISH_CLI_TOOLS.find((tool) => tool.id === selectedTarget.cliToolId) ?? PUBLISH_CLI_TOOLS[0]!;
  const deployClis = overview.snapshot?.deployClis ?? [];

  function handleTargetChange(id: string) {
    const next = STATIC_PUBLISH_TARGETS.find((target) => target.id === id);
    if (next) publishController.setTarget(next.id);
  }

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
          tabs={STATIC_PUBLISH_TARGETS.map((target) => ({ id: target.id, label: target.label }))}
          activeId={selectedTarget.id}
          onChange={handleTargetChange}
        />

        <div className="deployment-route">
          <div className="deployment-route-label">
            <AssistantIcon size={16} />
            <span className="deployment-fact-label">{translate("Recommended — ask the assistant")}</span>
          </div>
          <p className="deployment-action-reason">
            {translate(
              "Tovu's assistant runs as a command-line coding agent with its own shell, so once this tool is installed it can publish the export for you — nothing to paste here, and no credentials stored."
            )}
          </p>
          <ul className="deployment-provider-list">
            <ProviderCliRow tool={selectedTool} deployClis={deployClis} overviewLoaded={Boolean(overview.snapshot)} t={translate} />
          </ul>
        </div>

        <PublishCredentialsSection controller={credentialsController} t={translate} />

        <StaticPublishForm target={selectedTarget.id} controller={publishController} t={translate} />
      </div>
    </div>
  );
}

/**
 * The credential-management block — list, add, edit, delete named provider connections. Sits inside
 * `GettingItOnlineCard`, between the CLI-first recommendation and the token-based publish form,
 * because it answers exactly the question a reader has right after seeing the CLI route: "what if I
 * can't install a CLI here at all."
 *
 * Disclosure is driven ENTIRELY by `controller.executionMode` — the server's own fact, never
 * sniffed client-side (see `AdminPublishExecutionMode`'s doc in `lib/api.ts`):
 *
 * - `"self-hosted-cli"`: the CLI-first path above already works with no stored credential needed,
 *   so this whole block sits collapsed behind a native `<details>` "Advanced" disclosure (same
 *   affordance `Redirects.tsx`'s own bulk-import panel and `AiAssistant.tsx`'s roadmap accordion
 *   already use in this admin, rather than a second JS-driven one) and is never expanded by
 *   default — an operator who already has `gh`/`vercel` on PATH is never nagged for a token.
 * - `"hosted-api-only"`: this workspace cannot reach the operator's own terminal at all, so a
 *   stored credential is the ONLY way a publish can ever succeed here. The block renders OPEN, with
 *   a plain sentence saying so up front — this is the "tell the user they need an API key online"
 *   education surface named in the brief; nothing on this tab said this before today.
 *
 * Renders only a brief "Loading…" line until BOTH `credentials` and `executionMode` have resolved —
 * showing the self-hosted framing for one render before the real `executionMode` arrives would be a
 * worse false impression than a short, honest wait.
 */
function PublishCredentialsSection({ controller, t: translate }: { controller: PublishCredentialsController; t: Translate }) {
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

  if (controller.credentials === undefined || controller.executionMode === undefined) {
    return <p className="deployment-action-reason">{translate("Loading credentials…")}</p>;
  }

  const body = (
    <div
      className="deployment-credentials"
      {...agentHandle("deployment-static-site-credentials-section", {
        role: "region",
        label: "Saved publish credentials — add, edit, and delete named provider connections",
      })}
    >
      <PublishCredentialList controller={controller} t={translate} />
      {controller.isFormOpen ? (
        <PublishCredentialForm controller={controller} t={translate} />
      ) : (
        <button
          type="button"
          className="btn-secondary"
          onClick={controller.startAdd}
          {...agentHandle("deployment-static-site-credentials-add", {
            role: "button",
            label: "Open the form to save a new publish credential for one provider",
          })}
        >
          {translate("Add credential")}
        </button>
      )}
    </div>
  );

  if (controller.executionMode === "hosted-api-only") {
    return (
      <div className="deployment-route">
        <p
          className="notice warning"
          role="status"
          {...agentHandle("deployment-static-site-credentials-hosted-notice", {
            role: "status",
            label: "States that this hosted workspace cannot use a local CLI and needs a saved credential to publish",
          })}
        >
          {translate(
            "This workspace cannot use your computer's terminal or CLI sign-in. To publish here, connect a provider and save its credentials below."
          )}
        </p>
        {body}
      </div>
    );
  }

  return (
    <details className="deployment-credentials-advanced">
      <summary>{translate("Advanced: publish with server-side provider credentials")}</summary>
      <p className="deployment-action-reason">
        {translate("Only needed if you'd rather not install a CLI, or the assistant can't reach this machine's terminal.")}
      </p>
      {body}
    </details>
  );
}

/** One row per saved credential — label, provider, and last-updated time, matching the brief's
 *  "list by label + provider + updatedAt" requirement. Never renders anything from the credential
 *  itself beyond those three facts — see `AdminPublishCredentialSummary`'s own doc for why there is
 *  nothing else it COULD render. */
function PublishCredentialList({ controller, t: translate }: { controller: PublishCredentialsController; t: Translate }) {
  const credentials = controller.credentials ?? [];
  return (
    <>
      {credentials.length === 0 ? (
        <p className="deployment-action-reason">{translate("No credentials saved yet.")}</p>
      ) : (
        <ul className="deployment-credentials-list">
          {credentials.map((credential) => (
            <PublishCredentialRow key={credential.id} credential={credential} controller={controller} t={translate} />
          ))}
        </ul>
      )}
      {controller.deleteError ? (
        <p className="save-error" role="alert">
          {controller.deleteError}
        </p>
      ) : null}
      {controller.markDefaultError ? (
        <p className="save-error" role="alert">
          {controller.markDefaultError}
        </p>
      ) : null}
    </>
  );
}

/** One credential's own list row — split out from {@link PublishCredentialList} so each row's own
 *  `agentHandle` ids (edit/delete) are computed once per credential, not re-derived inline inside
 *  the `.map`.
 *
 *  Default chrome (a "Default" badge, or a "Make default" button on a non-default row) renders ONLY
 *  when this provider has more than one saved connection (`rules.ts`'s `credentialsForProvider`) —
 *  a lone connection is trivially the one `triggerPublish` uses, and showing a badge or a button for
 *  a choice that does not exist would be the exact "make the user think about it" the brief rules
 *  out. */
function PublishCredentialRow({
  credential,
  controller,
  t: translate,
}: {
  credential: AdminPublishCredentialSummary;
  controller: PublishCredentialsController;
  t: Translate;
}) {
  const deleting = controller.deletingId === credential.id;
  const markingDefault = controller.markingDefaultId === credential.id;
  const hasSiblingConnections = credentialsForProvider(controller.credentials ?? [], credential.providerId).length > 1;

  return (
    <li className="deployment-credentials-list-item">
      <div className="deployment-credentials-list-main">
        <span className="deployment-credentials-label">{credential.label}</span>
        <span className="status status-neutral" translate="no">
          {publishCredentialProviderInfo(credential.providerId).label}
        </span>
        {hasSiblingConnections && credential.isDefault ? (
          <span className="status status-ok">{translate("Default")}</span>
        ) : null}
        <span className="deployment-fact-value">
          {translate("Updated")} {formatTimestamp(credential.updatedAt)}
        </span>
      </div>
      <div className="deployment-credentials-list-actions">
        {hasSiblingConnections && !credential.isDefault ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={markingDefault}
            onClick={() => void controller.markAsDefault(credential.id)}
            {...agentHandle(`deployment-static-site-credentials-make-default-${credential.id}`, {
              role: "button",
              label: `Make the saved "${credential.label}" credential the default connection for ${publishCredentialProviderInfo(credential.providerId).label}`,
            })}
          >
            {markingDefault ? translate("Setting…") : translate("Make default")}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => controller.startEdit(credential)}
          {...agentHandle(`deployment-static-site-credentials-edit-${credential.id}`, {
            role: "button",
            label: `Edit the saved "${credential.label}" credential's label or replace its token`,
          })}
        >
          {translate("Edit")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={deleting}
          onClick={() => void controller.remove(credential.id)}
          {...agentHandle(`deployment-static-site-credentials-delete-${credential.id}`, {
            role: "button",
            label: `Permanently delete the saved "${credential.label}" credential`,
          })}
        >
          {deleting ? translate("Deleting…") : translate("Delete")}
        </button>
      </div>
    </li>
  );
}

/** The add/edit form — one `providerId` picker (disabled while editing; a saved credential's
 *  provider cannot be changed, only replaced by deleting and re-adding) plus the per-provider field
 *  set {@link PUBLISH_CREDENTIAL_PROVIDERS} describes. `token` is a `password` input and is NEVER
 *  pre-filled, in either mode — see `use-publish-credentials.hooks.ts`'s header for why a blank
 *  token while editing means "leave the stored secret unchanged", and the copy right below the
 *  field says so explicitly, because it is the one thing about this form people get wrong. */
function PublishCredentialForm({ controller, t: translate }: { controller: PublishCredentialsController; t: Translate }) {
  const mode: "add" | "edit" = controller.editingId === null ? "add" : "edit";
  const info = publishCredentialProviderInfo(controller.providerId);
  const fields: PublishCredentialFormFields = {
    providerId: controller.providerId,
    token: controller.token,
    accountId: controller.accountId,
  };
  const readyToSubmit = publishCredentialFormReadyToSubmit(fields, mode, controller.label);
  // A default choice only exists when at least one OTHER saved connection for this provider is
  // already there to be default INSTEAD of — see `use-publish-credentials.hooks.ts`'s header. A
  // provider about to get (or that already has) exactly one connection never shows this checkbox;
  // that connection is trivially the default either way.
  const otherCredentialsForProvider = credentialsForProvider(controller.credentials ?? [], controller.providerId).filter(
    (existing) => existing.id !== controller.editingId
  );
  const showsDefaultChoice = otherCredentialsForProvider.length > 0;

  return (
    <form
      className="deployment-credentials-form"
      onSubmit={(e) => {
        e.preventDefault();
        void controller.submit();
      }}
    >
      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="deployment-static-site-credentials-provider">
            {translate("Provider")}
          </label>
          <select
            id="deployment-static-site-credentials-provider"
            value={controller.providerId}
            disabled={mode === "edit"}
            onChange={(e) => controller.setProviderId(e.target.value as AdminPublishCredentialProviderId)}
            {...agentHandle("deployment-static-site-credentials-provider", {
              role: "field",
              label: "Which provider this saved connection publishes to",
            })}
          >
            {PUBLISH_CREDENTIAL_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id} translate="no">
                {provider.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="deployment-static-site-credentials-label">
            {translate("Label")}
          </label>
          <input
            id="deployment-static-site-credentials-label"
            type="text"
            value={controller.label}
            onChange={(e) => controller.setLabel(e.target.value)}
            placeholder={translate("e.g. Production GitHub Pages")}
            {...agentHandle("deployment-static-site-credentials-label", {
              role: "field",
              label: "Human-facing name for this connection — the only way to tell two saved credentials apart",
            })}
          />
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="deployment-static-site-credentials-token">
          {translate("Access token")}
        </label>
        <input
          id="deployment-static-site-credentials-token"
          type="password"
          autoComplete="off"
          value={controller.token}
          onChange={(e) => controller.setToken(e.target.value)}
          placeholder={mode === "edit" ? translate("Leave blank to keep the current token") : ""}
          {...agentHandle("deployment-static-site-credentials-token", {
            role: "field",
            label: "Provider access token — stored encrypted, never shown again once saved",
          })}
        />
        <p className="deployment-action-reason">
          {mode === "edit"
            ? translate(
                "Never shown back, even here — leave this blank to keep the token already saved, or type a new one to replace it."
              )
            : translate(
                "Stored encrypted on the server. Once saved, Tovu never displays it again — not even a partial version of it."
              )}
        </p>
        <p className="deployment-action-reason">
          {translate(info.scopeGuidanceKey)}{" "}
          <a href={info.tokenPageUrl} target="_blank" rel="noreferrer">
            {translate("Create a token")}
          </a>
        </p>
      </div>

      <PublishCredentialProviderFields controller={controller} t={translate} />

      {showsDefaultChoice ? (
        <label className="form-checkbox-field">
          <input
            type="checkbox"
            checked={controller.isDefault}
            onChange={(e) => controller.setIsDefault(e.target.checked)}
            {...agentHandle("deployment-static-site-credentials-is-default", {
              role: "checkbox",
              label: `Make this the default ${info.label} connection triggerPublish uses`,
            })}
          />
          {translate("Set as default for")} <span translate="no">{info.label}</span>
        </label>
      ) : null}

      <div className="deployment-action">
        <button
          type="submit"
          disabled={!readyToSubmit || controller.submitting}
          {...agentHandle("deployment-static-site-credentials-submit", {
            role: "button",
            label: "Save this publish credential",
          })}
        >
          {controller.submitting ? translate("Saving…") : mode === "add" ? translate("Save credential") : translate("Save changes")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={controller.cancelForm}
          {...agentHandle("deployment-static-site-credentials-cancel", {
            role: "button",
            label: "Discard this form without saving",
          })}
        >
          {translate("Cancel")}
        </button>
        {controller.formError ? (
          <p className="save-error" role="alert">
            {controller.formError}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** {@link PublishCredentialForm}'s per-provider field block, split out into its own function for
 *  the same complexity-gate reason `StaticSiteTab.tsx`'s own `resolveStaticExportHook`-style
 *  resolvers document. Renders exactly ONE provider's fields — the current `controller.providerId`
 *  — never more than one at a time, same "never show the other provider's row" rule
 *  `ProviderCliRow`'s own doc states for the CLI recommendation above.
 *
 *  Cloudflare Pages is the ONLY provider with a field here at all (`accountId`, required) — GitHub
 *  Pages' `owner`/`repo` and Vercel's `teamId` are NOT credential fields (they already live on the
 *  publish target config, chosen per run — see `AdminPublishConnectionInput`'s doc in `lib/api.ts`),
 *  and Netlify has no per-provider field. GitHub Pages and Vercel render nothing at all beyond the
 *  parent form's shared token field. */
function PublishCredentialProviderFields({ controller, t: translate }: { controller: PublishCredentialsController; t: Translate }) {
  if (controller.providerId !== "cloudflare-pages") return null;

  return (
    <div className="field">
      <label className="field-label" htmlFor="deployment-static-site-credentials-account">
        {translate("Account ID")}
      </label>
      <input
        id="deployment-static-site-credentials-account"
        type="text"
        value={controller.accountId}
        onChange={(e) => controller.setAccountId(e.target.value)}
        {...agentHandle("deployment-static-site-credentials-account", { role: "field", label: "Cloudflare account id — required, Cloudflare cannot resolve a project without it" })}
      />
    </div>
  );
}

/** The token-based preview+publish mini-form for whichever target is currently selected. Reads
 *  ONLY the fields the current target uses (see `use-static-publish.hooks.ts`'s header for why the
 *  hook still keeps both targets' fields in state at once) — a GitHub Pages selection never shows a
 *  `teamId` field, and vice versa. */
function StaticPublishForm({
  target,
  controller,
  t: translate,
}: {
  target: AdminStaticPublishTargetId;
  controller: StaticPublishController;
  t: Translate;
}) {
  const canPreview = staticPublishFormReadyForPreview(target, { owner: controller.owner, repo: controller.repo });
  const canPublish = staticPublishFormReadyToPublish(target, {
    owner: controller.owner,
    repo: controller.repo,
    projectName: controller.projectName,
  });
  const runTone = runStatusTone(controller.run?.status ?? "idle", controller.run?.result?.ok);
  const busy = controller.isPublishing;

  return (
    <div className="deployment-route">
      <div className="deployment-route-label">
        <span className="deployment-fact-label">{translate("Publish directly from here")}</span>
      </div>

      <div className="field-row">
        {target === "github-pages" ? (
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
        ) : (
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
        )}
        <div className="field">
          <label className="field-label" htmlFor="deployment-static-site-publish-project-name">
            {translate("Project name")}
          </label>
          <input
            id="deployment-static-site-publish-project-name"
            type="text"
            value={controller.projectName}
            onChange={(e) => controller.setProjectName(e.target.value)}
            {...agentHandle("deployment-static-site-publish-project-name", { role: "field", label: "Human-facing label for this publish — becomes the commit message or Vercel project name" })}
          />
        </div>
      </div>

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

      <div className="deployment-action">
        <span className={`status status-${runTone}`}>{translate(publishRunStatusLabelKey(controller.run))}</span>
        <button
          type="button"
          disabled={!canPublish || busy}
          onClick={() => void controller.publish()}
          {...agentHandle("deployment-static-site-publish-trigger", { role: "button", label: "Publish the current site export to this target right now — live on the public internet immediately" })}
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
        {controller.run ? <PublishRunResult run={controller.run} t={translate} /> : null}
      </div>
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
        <a href={run.result.url} target="_blank" rel="noreferrer" translate="no">
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
