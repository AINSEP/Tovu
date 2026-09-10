import {
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  optionalBoolean,
  optionalString,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
// `ToolInputError` specifically — see `features/post/tool-registrations.ts`'s identical import for
// why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather than
// redacting it into a message-stripped 500.
import { ToolInputError } from "@jini-ai/core";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { ToolContributor } from "#src/assistant/index";
import { deploymentsAgentToolCatalog } from "./agent-tools.js";
import type { DeploymentsReadRepoPort } from "./read-repo.js";
import { readDockerfileSource, writeDockerfileSourceWithIfMatch } from "./dockerfile.js";
import { getExportRunSnapshot, startExportRun, type ExportEngine, type ExportRunReportLike } from "./export-run.js";

/**
 * @file The Deployments domain's half of the agent-tool wiring split — maps
 * `agent-tools.ts`'s five catalog entries onto the same domain logic the admin HTTP routes already
 * use, as `ToolRegistration`s. All five are wired; none is excluded (see `agent-tools.ts`'s file
 * header for why this domain, unlike Recovery/Database, has no token-gated/human-only entry).
 *
 * Authorization shape: none of `startExportRun`/`getExportRunSnapshot`/`readDockerfileSource`/
 * `writeDockerfileSourceWithIfMatch`/`DeploymentsReadRepoPort`'s methods call `authorize()`
 * internally (they mirror the plain domain functions the admin routes already call inline), so
 * every handler below calls the kit's `requireToolPermission` itself — the same shape
 * `recovery`/`database` already use.
 *
 * 2026-08-15 (Terra audit finding C5): `deployment_set_dockerfile` now requires an `ifMatch` etag
 * and goes through `writeDockerfileSourceWithIfMatch` rather than the old unconditional
 * `writeDockerfileSource`, so a human editing the same file in the admin UI's Dockerfile tab and
 * this tool can no longer silently overwrite each other — see that function's own doc in
 * `dockerfile.ts` for the full decision record.
 */

/**
 * The exact slice of the route-deps bag this domain's tool handlers read. Declared structurally,
 * never naming `server/routes/types`'s `RouteDeps` — same discipline every OTHER domain's
 * `tool-registrations.ts` already follows (see `features/recovery/tool-registrations.ts`'s file
 * header), now including this one.
 *
 * 2026-08-20 RouteDeps-narrowing fix (supersedes `b6144774`'s config-only attempt, which the owner
 * rejected — see `ADS-memory/reports/2026-08-20-architecture-step2-routedeps-narrowing.md`): this
 * used to be a bare `export type DeploymentsToolDeps = RouteDeps` alias, on the grounds that
 * `deployment_trigger_export` genuinely needs the full composition-root bag to boot a real
 * `createApp(routeDeps)` and crawl every route — that part was, and remains, true. What changed is
 * `startExportRun` no longer has to receive the REAL `RouteDeps.runExportSite` (`ExportEngine<RouteDeps>`,
 * which contravariantly requires the FULL bag on every call): `exportSiteBound` below is a pre-bound
 * export call, closed over `RouteDeps` once at the composition root (`server/app.ts`/`server/deps.ts`
 * — see `routes/types.ts`'s own doc on that field), so this domain only ever has to describe the
 * narrow slice it directly touches. The adapter passed to `startExportRun` (in
 * `deployment_trigger_export` below) EXPLICITLY DESTRUCTURES `{outputDir, clean, basePath}` off the
 * `ExportEngine`-shaped options object rather than forwarding it wholesale — `ExportEngine<T>`'s own
 * options ALWAYS carry a `routeDeps: T` field (`export-run.ts`), and forwarding that bag straight into
 * `exportSiteBound` (whose own type has no `routeDeps` parameter at all, so an excess one on a
 * non-literal argument passes `tsc` silently) would let a NARROW `DeploymentsToolDeps` value reach the
 * real `exportSite` in place of the actual `RouteDeps` — caught during this fix, closed at both the
 * composition root (spread-ordering fix, `routes/types.ts`'s `exportSiteBound` doc) AND here, and
 * covered by a regression test in `__tests__/integration/tool-registrations.integration.test.ts`.
 */
export interface DeploymentsToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly exportOutputRootDir: string;
  readonly deploymentsReadRepo: DeploymentsReadRepoPort;
  /**
   * The pre-bound export call this domain uses for `deployment_trigger_export` — see this
   * interface's own doc above for the fuller design reasoning, and `routes/types.ts`'s
   * `exportSiteBound` for what this really is and why it is named differently from
   * `RouteDeps.runExportSite`. Returns `ExportRunReportLike` (`export-run.ts`'s own structural
   * mirror of the real `ExportReport`) rather than the real type, deliberately: this domain already
   * imports `ExportRunReportLike` from its sibling `export-run.ts`, so reusing it here avoids a
   * fresh `#src/platform/export/index` type import — the real `RouteDeps.exportSiteBound` (which returns the
   * real `ExportReport`) already satisfies this structurally (same reasoning `ExportEngine`'s own
   * doc gives for its return type).
   */
  readonly exportSiteBound: (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportRunReportLike>;
}

const CATALOG_BY_ID = indexCatalogById(deploymentsAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const deploymentsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> startExportRun (export-run.ts) -> exportSite: writes a folder of HTML/CSS/JS/asset files to
  //    disk. A real mutation, same classification as `backup_create_restore_point`.
  ["deployment_trigger_export", "mutates-durable-state"],
  // -> getExportRunSnapshot(): reads a process-local in-memory variable. No I/O of any kind.
  ["deployment_get_export_status", "none"],
  // -> DeploymentsReadRepoPort's four list methods: read-only repo queries.
  ["deployment_list", "none"],
  // -> readDockerfileSource (dockerfile.ts): one existence check, one file read. No write.
  ["deployment_get_dockerfile", "none"],
  // -> writeDockerfileSource (dockerfile.ts): one file write to the repo-root Dockerfile.
  ["deployment_set_dockerfile", "mutates-durable-state"],
]);

export function buildDeploymentsRegistrations(routeDeps: DeploymentsToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    deployment_trigger_export: async (ctx) => {
      if (ctx.input !== undefined && !isRecord(ctx.input)) throw new ToolInputError("input must be an object");
      const input = isRecord(ctx.input) ? ctx.input : {};
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "system.export", entityType: "site-export" });

      // No `await` between this check and `startExportRun` below — matches `export-site.ts`'s own
      // "no await between check and set" atomicity comment exactly, so a tool call and a concurrent
      // HTTP trigger in this SAME process can never both observe "not running" (see `export-run.ts`'s
      // file header for the one case where this process is not the same one: the standalone daemon).
      if (getExportRunSnapshot().status === "running") {
        throw new Error("an export is already running — call deployment_get_export_status to see its progress, this will not resolve on retry");
      }

      const clean = optionalBoolean(input, "clean") ?? false;
      const basePath = optionalString(input, "basePath");
      // Explicit destructuring, not `(opts) => routeDeps.exportSiteBound(opts)` — `ExportEngine`'s
      // own options object always carries a `routeDeps` field (`export-run.ts`), and forwarding it
      // wholesale would let that narrow `DeploymentsToolDeps` value reach `exportSiteBound` under a
      // `routeDeps` key nobody asked for (its own type has no such parameter, so `tsc` would not
      // catch the excess property on this non-literal argument). Picking only the three fields
      // `exportSiteBound` actually declares means the narrow deps here never travel at all — see
      // `DeploymentsToolDeps`'s own doc above and this file's regression test.
      const engine: ExportEngine<DeploymentsToolDeps> = ({ outputDir, clean: runClean, basePath: runBasePath }) =>
        routeDeps.exportSiteBound({ outputDir, ...(runClean !== undefined ? { clean: runClean } : {}), ...(runBasePath !== undefined ? { basePath: runBasePath } : {}) });
      return startExportRun(routeDeps, engine, { clean, basePath });
    },

    deployment_get_export_status: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "system.read", entityType: "site-export" });
      return getExportRunSnapshot();
    },

    deployment_list: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "deployment-target" });

      const workspaceId = routeDeps.workspaceId;
      const [environments, targets, releases, runs] = await Promise.all([
        routeDeps.deploymentsReadRepo.listEnvironments({ workspaceId }),
        routeDeps.deploymentsReadRepo.listTargets({ workspaceId }),
        routeDeps.deploymentsReadRepo.listReleases({ workspaceId }),
        routeDeps.deploymentsReadRepo.listRuns({ workspaceId }),
      ]);
      return { environments, targets, releases, runs };
    },

    deployment_get_dockerfile: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "system.read", entityType: "dockerfile-source" });
      return readDockerfileSource();
    },

    deployment_set_dockerfile: async (ctx) => {
      // Both fields validated before the permission check, same order `deployment_trigger_export`
      // above already uses — a shape rejection should never need an authorize() round trip first.
      const input = requireInputRecord(ctx.input);
      const contents = requireString(input, "contents");
      const ifMatch = requireString(input, "ifMatch");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "system.write", entityType: "dockerfile-source" });

      const result = writeDockerfileSourceWithIfMatch(contents, ifMatch);
      if (!result.ok) {
        // Thrown, not returned — `ToolExecutor` reads a thrown error as the failed execution and
        // surfaces its `.message` to the model, so the message itself IS the model's only channel
        // for "what happened and what to do next" (Terra audit finding C5's "agent check and fix"
        // requirement). Names the concrete recovery path (re-read, reconcile, retry) rather than a
        // bare "conflict" — and includes the current contents inline so the model can reconcile in
        // the same turn instead of spending a second tool call on deployment_get_dockerfile first
        // (it MAY still call it, e.g. to double-check nothing changed again in the meantime).
        //
        // `ToolInputError`, not a bare `Error` — same reclassification `features/post/
        // tool-registrations.ts`'s `toModelFacingUpdateError` applies to `PostVersionConflictError`:
        // a stale `ifMatch` is exactly "the caller's input was the problem and a DIFFERENT input (the
        // fresh etag echoed below) fixes it," which is what the marker means, not a trick to defeat
        // the redaction. A bare `Error` here would reach the model as a message-stripped 500,
        // discarding the one thing it needs — the current contents/etag to reconcile against.
        throw new ToolInputError(
          `deployment_set_dockerfile: refused — the Dockerfile changed on the server since your 'ifMatch' ('${ifMatch}') was read; its current etag is now '${result.current.etag}'. ` +
            `The file's CURRENT contents (as of right now, echoed here so you don't have to call deployment_get_dockerfile again just to see them) are:\n\n${result.current.exists ? result.current.contents : "(the file does not exist)"}\n\n` +
            `Reconcile your intended change against these current contents, then retry deployment_set_dockerfile with contents built on top of them and ifMatch set to '${result.current.etag}'. If you want to confirm nothing has changed a second time before retrying, call deployment_get_dockerfile again first. This will not resolve on retry with the same ifMatch.`
        );
      }
      return result.snapshot;
    },
  };

  return buildDomainRegistrations({
    domain: "deployments",
    catalogModule: "features/deployments/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: deploymentsDerivedRisk,
  });
}

/**
 * Contributes Deployments' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module.
 *
 * 2026-08-17: Deployments was tried for the tool-contribution registry in Stage 2 batch 2 and
 * reverted the same session. This file's own imports looked clean in isolation (`export-run.ts`
 * imports nothing beyond `node:path`; `DeploymentsToolDeps = RouteDeps` is type-only), and no sibling
 * domain imports `features/deployments/tool-registrations` itself. But `check:architecture`'s module
 * graph is PER-DIRECTORY, not per-file: `src/features/deployments` is one module, and this
 * directory's sibling `static-publish/index.ts` exports `extractGitHubLogin`, which
 * `features/source-control/store.ts` value-imported (`from "../deployments/static-publish/index.js"`).
 * Chain that closed the cycle: `assistant -> features/vendor-credentials`
 * (`tool-registrations.ts`'s own `REAL_VENDOR_CREDENTIAL_PORT` wiring, unconditional) ->
 * `features/source-control` (`vendor-credentials/dual-read.ts`'s `resolveDefaultForSourceControl`
 * import) -> `features/deployments` (via that `extractGitHubLogin` import) -> back to `assistant`
 * (this file's own attempted `registerToolContributor` call). Confirmed via `check:architecture
 * --list`: largest strongly-connected component (runtime-only) went 0 -> 4 — `[assistant,
 * features/deployments, features/source-control, features/vendor-credentials]`. Same root cause as
 * `features/source-control/tool-registrations.ts`'s own former revert comment, reached from the
 * opposite end of the chain. Also blocked `static-publish` (`publish-agent-tools.ts`, this
 * directory's other domain) for the identical reason, since both live in the same
 * `features/deployments` module.
 *
 * RETRIED 2026-08-17 (same day, later pass) after `vendor-credentials/dual-read.ts`'s Option B fix
 * (`ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md`) landed
 * and `source-control` converted cleanly on top of it — the design report's own chain trace named
 * `dual-read.ts`'s imports as the root cause, and fixing those alone WAS sufficient for
 * `source-control`. It was NOT sufficient for `deployments`: reverted again, this time on a
 * DIFFERENT, previously-undocumented edge the design report never analyzed —
 * `features/vendor-credentials/store.ts:5` (not `dual-read.ts`) value-imported `extractGitHubLogin`
 * from `./static-publish/index` directly, for `createVendorCredential`'s own GitHub-login-probe
 * logic. That edge was untouched by the Option B fix (which only rewired `dual-read.ts`). Confirmed
 * via `check:architecture --list`: adding `registerToolContributor` here closed a NEW, smaller
 * 3-module cycle — `[assistant, features/deployments, features/vendor-credentials]` — via
 * `assistant -> features/vendor-credentials` (unconditional, `REAL_VENDOR_CREDENTIAL_PORT`) ->
 * `features/vendor-credentials/store.ts` (`extractGitHubLogin`) -> `features/deployments` -> back to
 * `assistant`.
 *
 * RETRIED AND LANDED HERE (2026-08-17, same session) once `vendor-credentials/store.ts`'s own
 * `extractGitHubLogin` value import was ALSO cut using the same Option-B-style injection technique —
 * see that file's header ("Why `probeAccountLabel`'s GitHub-login extractor is INJECTED, not
 * imported") for the full trace. With both `dual-read.ts` and `store.ts` no longer value-importing
 * anything from `features/source-control`/`features/deployments`, `assistant -> features/vendor-
 * credentials` no longer reaches back into this module at all, so this registry edge is now
 * one-directional. `check:architecture` confirms 0 module cycles / largest SCC 0 with Deployments
 * wired this way.
 */
export function contributeDeploymentsTools(): ToolContributor {
  return { domain: "deployments", build: buildDeploymentsRegistrations, risk: deploymentsDerivedRisk };
}
