import { rmSync } from "node:fs";
import path from "node:path";

import { DeployError, type DeployFile, type DeployPublishInput, type DeployPublishResult, type DeployTarget, type UnknownRecord } from "@jini-ai/devops/deploy";

import { PUBLIC_PAGE_SECURITY_HEADERS } from "#src/contracts/core/public-page-security-headers";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import type { ObservabilityPort } from "#src/platform/observability/index";
import type { DeployHostKit, DeployTargetCredential, DeployTargetRegistry, HostDeployTarget, LoadedDeployTarget } from "#src/features/deployments/deploy-targets/types";

import type { ExportReport } from "#src/features/site-export/index";
/**
 * Imported from the LEAF `export-failure-summary.ts`, not from `#src/features/site-export/index`.
 *
 * This is a runtime import, and that is the point: it adds exactly ONE module to this file's eager
 * graph. Importing the same function through the barrel would add 65 (`express`, better-sqlite3,
 * drizzle, handlebars, liquidjs and the whole theme/post/db graph, via `site-exporter.ts`), on a
 * module reached from `assistant/tool-registrations.ts`. Avoiding that cost — not a cycle — is why
 * this function was previously resolved by a call-time `require("#src/features/site-export/index")`.
 *
 * The `require()` is gone because it was corrupting coverage: under `tsx` it loaded the barrel and
 * its whole graph a second time through the CJS hook, and the two images merged into one broken
 * lcov block per file. Measured 2026-09-05 at 45 contaminated first-party blocks, 28 SEVERE, from
 * this one call site. Pinned by `features/source-control/__tests__/commit-site-export-resolution.unit.test.ts`.
 *
 * On the cycle the old comment here described (`adapter.ts -> export/index.ts ->
 * site-exporter.ts -> server/app.ts -> ... -> src/assistant`): that back-edge no longer exists.
 * `site-exporter.ts` dropped its `server/app.ts` import in the 2026-08-16 rework, and its current
 * runtime imports are `node:*`, an `express` TYPE, `#src/contracts/core/index` and
 * `#src/features/theme/index` — nothing under `server/` or `assistant/`. The leaf module imports
 * nothing at runtime at all, so it cannot participate in a cycle regardless.
 */
import { firstExportFailure, type ExportFailureSummary } from "#src/features/site-export/export-failure-summary";

import { toDeployTargetCredential } from "./credentials.js";
import type { PublishCredentialSource, StaticPublishConfig, StaticPublishOutcome, StaticPublishTargetId } from "./types.js";

/**
 * @file Publishes Tovu's own static export through a deploy target that an Agent Plugin contributes
 * (`deploy-targets/registry.ts`). Core names no hosting vendor: which targets exist, which config
 * fields each takes, how each validates them, which base path each serves from, and what extra files
 * each host needs all come from the plugin's descriptor and module (deploy plan T7).
 *
 * Purpose:
 * "Wrap it, do not reimplement" — this module does no host HTTP itself. It (a) resolves the target
 * and checks its config ({@link planStaticPublish}), (b) runs Tovu's real static exporter with the
 * base path the target's module computes, (c) maps the resulting `ExportReport` into `DeployFile[]`,
 * and (d) hands the file set, plus the live security headers as data (`responseHeaders`), to the
 * `DeployTarget` the module builds.
 *
 * Base-path/target mismatch, made structurally impossible rather than merely documented:
 * `StaticPublishConfig` has NO `basePath` field — a caller can never supply one. The target module
 * derives it from the config, and {@link publishStaticSite} always runs a FRESH `exportSite` with
 * that exact value immediately before publishing, so no previously-produced export (built with some
 * other or no base path) can reach a target. The cost is a full re-export per publish, accepted
 * deliberately: a stale base path silently 404ing every asset on a live site is strictly worse.
 *
 * A refused export (any route or asset failed) never reaches a target at all — this module will not
 * publish a known-incomplete site, mirroring `cli/commands/export.ts`'s own honesty contract.
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic. Depends on `deploy-targets/` for the target
 * registry and host kit. No dependency on `../ports.ts`/`../providers/github.ts` (the sibling
 * continuous-deployment feature) — see `./types.ts`'s header for why these stay separate.
 */

const MAX_PROJECT_NAME_LENGTH = 200;

/** {@link planStaticPublish}'s answer: the resolved target and the base path it serves from, or a
 *  human-readable refusal safe to return over an HTTP/tool boundary. */
export type StaticPublishPlan =
  | { readonly ok: true; readonly target: LoadedDeployTarget; readonly basePath?: string }
  | { readonly ok: false; readonly message: string };

/**
 * Resolves `config.target` in `registry` and checks `config` against it: every required descriptor
 * field present and non-blank, then the module's own `validateConfig`. Pure given the registry, so
 * the admin preview, the agent tools and a real publish all reach the SAME verdict and base path.
 *
 * @returns The plan, or the first refusal. Messages never echo more than the offending field.
 * @complexity O(f) declared config fields plus the module's own (constant-size) checks.
 */
export function planStaticPublish(registry: DeployTargetRegistry, config: StaticPublishConfig): StaticPublishPlan {
  const target = registry.get(config.target);
  if (target === undefined) return { ok: false, message: unknownTargetMessage(registry, config.target) };
  const missing = missingRequiredFieldMessage(target, config);
  if (missing !== null) return { ok: false, message: missing };
  const moduleConfig = config as unknown as UnknownRecord;
  const configError = target.module.validateConfig?.(moduleConfig);
  if (configError) return { ok: false, message: configError };
  const basePath = target.module.basePath?.(moduleConfig);
  return { ok: true, target, ...(basePath !== undefined ? { basePath } : {}) };
}

/** The refusal for the first descriptor-required field `config` leaves absent or blank, else `null`.
 *  Exported so the admin preview can answer a missing field as a malformed request (400) while a
 *  present-but-invalid value stays a 200 `valid:false`. @complexity O(f) declared config fields. */
export function missingRequiredFieldMessage(target: LoadedDeployTarget, config: StaticPublishConfig): string | null {
  for (const field of target.descriptor.configFields) {
    const value = config[field.name];
    if (field.required && (typeof value !== "string" || value.trim() === "")) {
      return `'${field.name}' (non-empty string) is required for target '${config.target}'`;
    }
  }
  return null;
}

/** The refusal for an id the registry does not know, naming what IS available. @complexity O(t). */
export function unknownTargetMessage(registry: DeployTargetRegistry, targetId: string): string {
  const ids = registry.list().map((target) => target.descriptor.id);
  if (ids.length === 0) return `publish target '${targetId.slice(0, 64)}' is not available: no publish targets are installed (turn on the Deploy Online Agent Plugin)`;
  return `publish target '${targetId.slice(0, 64)}' is not available; choose one of: ${ids.join(", ")}`;
}

/**
 * Builds a publish config from loosely-typed input (a JSON body, a query string, a tool input):
 * `target` plus every descriptor-declared field that arrived as a string. Unknown keys are dropped,
 * so nothing a caller invents reaches a module. Whether required fields are present is judged once,
 * by {@link planStaticPublish}.
 *
 * @param blankAsAbsent - `true` for a query string or tool input, where an empty optional field
 *   means "not set"; `false` for a JSON body, which keeps it so the module can refuse it by name.
 * @returns The config, or the refusal for a declared field that arrived as a non-string.
 * @complexity O(f) declared fields.
 */
export function readStaticPublishConfig(
  target: LoadedDeployTarget,
  raw: Readonly<Record<string, unknown>>,
  options: { readonly blankAsAbsent: boolean },
): { readonly ok: true; readonly config: StaticPublishConfig } | { readonly ok: false; readonly message: string } {
  const config: Record<string, string> = { target: target.descriptor.id };
  for (const field of target.descriptor.configFields) {
    const value = raw[field.name];
    if (value === undefined || (options.blankAsAbsent && (typeof value !== "string" || value.trim() === ""))) continue;
    if (typeof value !== "string") return { ok: false, message: `'${field.name}' must be a string` };
    config[field.name] = value;
  }
  return { ok: true, config: config as StaticPublishConfig };
}

/**
 * Each publish RUN gets its OWN directory under `infra/` (the Docker-volume-mounted directory every
 * other export/publish artifact already lives under) — `<parent>/<target>/<runId>`, not merely
 * `<parent>/<target>`. Exported (not merely internal) specifically so this per-run isolation is
 * directly testable.
 *
 * MEDIUM audit finding (2026-08-19, Codex sol bug/architecture audit): a fixed `<parent>/<target>`
 * directory meant two publishes overlapping for the SAME target — the admin UI and a confirmed
 * agent tool call, or two OS processes (`publish-run.ts`'s own header discloses its single-flight
 * guard is process-local only, a DELIBERATE, disclosed gap this fix closes as a side effect) — could
 * `clean:true` and rewrite the same directory out from under each other. `runId` (always a fresh
 * `input.idGen.newId()` value, minted once per {@link publishStaticSite} call) makes that
 * collision structurally impossible: no lock is needed because there is no longer anything shared to
 * lock. The directory is disposable once `exportSiteBound` returns — see
 * {@link cleanupPublishRunDir}'s own doc for why nothing downstream re-reads it from disk.
 *
 * `parent` is `RouteDeps.publishOutputRootDir` (`TOVU_PUBLISH_DIR` env, then `infra/publish` —
 * mirroring `export-site.ts`'s own `TOVU_EXPORT_DIR` knob), resolved ONCE by the composition root
 * (`server/app.ts`/`server/deps.ts`) and threaded through as {@link StaticPublishInput.publishOutputRootDir}
 * (2026-08-20 RouteDeps-narrowing fix — this used to be `input.routeDeps.publishOutputRootDir`; the
 * field moved, the value and its single-resolution-point discipline did not) — never read from
 * `process.env` in this file. A test overrides it the same way it always did: by setting
 * `publishOutputRootDir` on the fake `StaticPublishInput` it constructs, not by mutating real process
 * env vars.
 * @complexity O(1) — fixed-shape path join, no I/O.
 */
export function publishOutputDir(parent: string, target: StaticPublishTargetId, runId: string): string {
  return path.join(parent, target, runId);
}

/** Best-effort cleanup of one run's isolated export directory (see {@link publishOutputDir}'s own
 *  doc). Safe to call once `exportSiteBound` has returned or thrown: every byte `publishStaticSite`
 *  still needs travels through `report.routes.succeeded`/`report.assets.succeeded`'s own `data`
 *  fields (captured in memory at write time — `site-exporter.ts`'s own "reachable as DATA" header),
 *  never by re-reading this directory, so removing it here cannot affect anything downstream. Never
 *  throws: a cleanup failure (a stray permission error, a file another process still holds open)
 *  must not turn an otherwise-successful publish into a reported failure — the same best-effort,
 *  disclosed-rather-than-silent posture `publish-run.ts`'s `recordHistoryIfPublished` already
 *  documents for an analogous non-essential side effect.
 * @complexity O(n) in the (typically small) exported file count — a recursive directory removal. */
function cleanupPublishRunDir(outputDir: string): void {
  try {
    rmSync(outputDir, { recursive: true, force: true });
  } catch {
    // Swallowed deliberately — see this function's own doc.
  }
}

/** Normalizes an `ExportedRoute`/`ExportedAsset`'s `outputFile` (already deploy-relative, per that
 *  interface's own doc) to forward slashes — `path.relative` uses the platform separator, and every
 *  deploy target in `@jini-ai/devops` treats `DeployFile.file` as a literal repo/deployment path,
 *  where a stray backslash on a Windows host would be be a wrong path, not a normalized one.
 *
 *  `contentType` also accepts `null` here (as well as the caller simply omitting it): `ExportedRoute`/
 *  `ExportedAsset` carry it as `string | null` because a fetched response can genuinely have no
 *  `Content-Type` header — see that interface's own doc. `DeployFile.contentType` has no concept of
 *  `null`, so both "absent" states collapse to "omit the field" the same way here, at the one place
 *  that actually needs the narrower `string | undefined` shape. */
export function toDeployFile(entry: { outputFile: string; data: string | Buffer; contentType?: string | null }): DeployFile {
  return {
    file: entry.outputFile.split(path.sep).join("/"),
    data: entry.data,
    ...(entry.contentType !== undefined && entry.contentType !== null ? { contentType: entry.contentType } : {}),
  };
}

/** The resolved credential a `DeployTarget` is built from: `token` plus the host's other declared
 *  credential fields (see `types.ts`'s `PublishCredentialSource.resolve()` doc). */
export type ResolvedPublishCredential = DeployTargetCredential;

export interface StaticPublishDeps {
  readonly credentialSource: PublishCredentialSource;
  /** This workspace's plugin-contributed deploy targets (`deploy-targets/registry.ts`): the only
   *  place a target id, its config fields and its host behavior come from. */
  readonly loadDeployTargets: (workspaceId: string) => Promise<DeployTargetRegistry>;
  /** Test seam: builds the `DeployTarget` in place of the resolved module's `create()`. Config
   *  checks and the base path still come from the registry. */
  readonly buildTarget?: (config: StaticPublishConfig, credential: ResolvedPublishCredential) => DeployTarget;
  /** The kit handed to a plugin module. Defaults to {@link createDeployHostKit}; tests inject one. */
  readonly hostKit?: DeployHostKit;
  /** `RouteDeps.observability`: the default kit traces the plugin's egress through it. */
  readonly observability?: ObservabilityPort;
}

/**
 * The composition-root-bound export call this domain takes instead of `RouteDeps` itself (2026-08-20
 * RouteDeps-narrowing fix, continuing `src/features/source-control/commit-site.ts`'s own
 * `ExportSiteBoundFn` fix onto this sibling domain — see that file's doc for the fuller design
 * rationale, and `server/routes/types.ts`'s `RouteDeps.exportSiteBound` doc for why this shape is
 * deliberately NOT the same as `RouteDeps.runExportSite`/`ExportEngine<RouteDeps>`).
 *
 * Declared locally, never imported from `RouteDeps` or from `commit-site.ts`'s identical copy — same
 * "duplicate the tiny type, never share across features" convention that file's own doc documents,
 * and the same one this file already followed for `OWNER_PATTERN`/`REPO_PATTERN`/`BRANCH_PATTERN`.
 */
export type ExportSiteBoundFn = (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportReport>;

export interface StaticPublishInput {
  readonly workspaceId: string;
  /** `RouteDeps.publishOutputRootDir`, threaded down rather than the whole `RouteDeps` bag — see
   *  {@link ExportSiteBoundFn}'s own doc immediately above for why. */
  readonly publishOutputRootDir: string;
  readonly idGen: { newId(): string };
  /** The pre-bound export call — see {@link ExportSiteBoundFn}'s own doc for what it is and why it
   *  replaces the `routeDeps: RouteDeps` field this input used to carry. */
  readonly exportSiteBound: ExportSiteBoundFn;
  readonly config: StaticPublishConfig;
  /** Human-facing label — becomes the GitHub commit message subject / the Vercel project-name seed.
   *  Sanitized further by Jini's own `safeProjectLabel`/`safeVercelProjectName`; validated here only
   *  for length and non-blankness. */
  readonly projectName: string;
  /** The saved connection the OPERATOR chose for this publish, when the caller has one (terra review
   *  2026-09-20, finding 1 — Critical). Passed through to `credentialSource.resolve()` VERBATIM and
   *  validated there, never here: this module has no repo/sealer and no way to judge an id. Absent
   *  means the caller genuinely has no chosen connection (`deployment_execute_static_publish`, and
   *  any install whose credentials come from server env vars) and the established default lookup
   *  applies — see `./types.ts`'s `PublishCredentialSource.resolve` doc for that contract. */
  readonly credentialId?: string;
}

/** The `{ok:true, ...}` member of `PublishCredentialSource["resolve"]`'s return union — the shape
 *  {@link resolvePublishCredentialForSite} hands back once it has already ruled out both a thrown
 *  decrypt failure and an `{ok:false}` "not configured" result. */
type ResolvedCredentialSourceSuccess = Extract<Awaited<ReturnType<PublishCredentialSource["resolve"]>>, { ok: true }>;

/**
 * Resolves `input.config.target`'s credential via `deps.credentialSource.resolve()`, translating
 * both a thrown decrypt failure and an `{ok:false}` "not configured" result into
 * {@link publishStaticSite}'s own `{ok:false, code, message}` channel — see that function's own
 * header doc for the full "never throws" contract this step upholds.
 *
 * `PublishCredentialSource.resolve()`'s own doc documents a throw as a real, DELIBERATE possibility
 * for the DB-backed source (`publish-credentials/store.ts`'s `resolveForPublish`/
 * `resolveDefaultForPublish`: "a decrypt failure here should surface, not degrade" — a corrupted row
 * or a missing site key throws rather than resolving a silent `null`). `publishStaticSite`'s own
 * contract is that IT never throws regardless — so a genuine decrypt failure still needs to
 * "surface", just through the established `{ok:false, code, message}` channel instead of an uncaught
 * exception, exactly like every other failure mode in that function. `err.message` only, same
 * boundary {@link publishAndMapOutcome}'s own catch documents — a decrypt failure's message names the
 * mechanism (bad AAD, tampered ciphertext, missing key), never the ciphertext or a derived secret
 * itself.
 */
async function resolvePublishCredentialForSite(
  deps: StaticPublishDeps,
  input: StaticPublishInput
): Promise<{ ok: true; credential: ResolvedCredentialSourceSuccess } | { ok: false; outcome: StaticPublishOutcome }> {
  let credential: Awaited<ReturnType<PublishCredentialSource["resolve"]>>;
  try {
    credential = await deps.credentialSource.resolve({
      workspaceId: input.workspaceId,
      target: input.config.target,
      // Conditional spread, never `credentialId: input.credentialId` — an absent choice must not
      // travel as an explicit `undefined` key, which a source could read as "a choice was made".
      ...(input.credentialId !== undefined ? { credentialId: input.credentialId } : {}),
    });
  } catch (err) {
    return {
      ok: false,
      outcome: {
        ok: false,
        code: "NO_CREDENTIALS_CONFIGURED",
        message: `credential could not be resolved: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
  if (!credential.ok) {
    return { ok: false, outcome: { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: credential.reason } };
  }
  return { ok: true, credential };
}

/**
 * Runs `input.exportSiteBound` for this one publish run into `outputDir`, translating both a thrown
 * export failure and a report carrying a failed route/asset into {@link publishStaticSite}'s own
 * `{ok:false, code:"EXPORT_FAILED"}` channel. Cleans up the run's output directory in every case
 * (thrown, failed-report, or success) — see {@link cleanupPublishRunDir}'s own doc for why the
 * directory is safe to remove immediately once this call has produced its in-memory `report`.
 *
 * Checks BOTH `routes.failed` and `assets.failed` (HIGH audit finding, 2026-08-19 Codex sol bug/
 * architecture audit) — this used to check only `routes.failed`, so a page could export fine while
 * its own stylesheet or hero image 404s and publishing would still report success. See
 * `firstExportFailure`'s own doc (`#src/features/site-export/export-failure-summary`) for the shared check both this
 * function and `commit-site.ts`'s `commitSiteToSourceControl` now use.
 */
async function runExportForPublish(
  input: StaticPublishInput,
  outputDir: string,
  basePath: string | undefined
): Promise<{ ok: true; report: ExportReport } | { ok: false; outcome: StaticPublishOutcome }> {
  let report: ExportReport;
  try {
    report = await input.exportSiteBound({ outputDir, clean: true, ...(basePath !== undefined ? { basePath } : {}) });
  } catch (err) {
    cleanupPublishRunDir(outputDir);
    return {
      ok: false,
      outcome: {
        ok: false,
        code: "EXPORT_FAILED",
        message: `export failed before publishing could start: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
  cleanupPublishRunDir(outputDir);

  const failure = firstExportFailure(report);
  if (failure) {
    return {
      ok: false,
      outcome: {
        ok: false,
        code: "EXPORT_FAILED",
        message: `refused to publish: ${failure.count} ${failure.kind}(s) failed to export (first: '${failure.identifier}' — ${failure.reason})`,
      },
    };
  }
  return { ok: true, report };
}

/** Maps a successful export `report` to the `DeployFile[]` a target's `publish()` takes. A host's
 *  own extra files (a header config, a marker file) are its module's job, never this one's.
 *  @complexity O(n) in the exported route + asset count. */
function buildDeployFilesForPublish(report: ExportReport): DeployFile[] {
  return [...report.routes.succeeded.map(toDeployFile), ...report.assets.succeeded.map(toDeployFile)];
}

/**
 * `result.status` is EVERY target's own honest terminal state (`DeployLinkStatus`) — not merely "did
 * the API call succeed". A status other than 'ready' means the provider accepted the publish but the
 * site is not (yet, or ever, without a further step outside this call) reachable — spec
 * `custom-publish-provider-contract.md` §3a's "uploaded, but not yet reachable" requirement, required
 * regardless of provider once `StaticPublishOutcome` carries a real third branch for it (see that
 * type's own header). Applied uniformly here rather than special-cased per target: every target
 * already resolves its own `status` internally before returning (verified directly against
 * `VercelDeployTarget.publish()`'s own `waitForReachableDeploymentUrl` call), so this is the one
 * place that turns an already-honest `status` into an equally-honest `StaticPublishOutcome`.
 */
function buildPartialPublishOutcome(targetId: StaticPublishTargetId, result: DeployPublishResult, basePath: string | undefined): StaticPublishOutcome {
  return {
    ok: "partial",
    targetId,
    url: result.url,
    status: result.status,
    message: result.statusMessage ?? `Published to ${targetId}, but the public URL is not confirmed reachable yet (status: ${result.status}).`,
    ...(result.deploymentId !== undefined ? { deploymentId: result.deploymentId } : {}),
    ...(basePath !== undefined ? { basePath } : {}),
    ...(result.providerMetadata !== undefined ? { providerMetadata: result.providerMetadata } : {}),
  };
}

/** {@link buildPartialPublishOutcome}'s sibling for `result.status === "ready"` — a full success. */
function buildSuccessPublishOutcome(targetId: StaticPublishTargetId, result: DeployPublishResult, basePath: string | undefined): StaticPublishOutcome {
  return {
    ok: true,
    targetId,
    url: result.url,
    status: result.status,
    ...(result.deploymentId !== undefined ? { deploymentId: result.deploymentId } : {}),
    ...(basePath !== undefined ? { basePath } : {}),
    ...(result.providerMetadata !== undefined ? { providerMetadata: result.providerMetadata } : {}),
  };
}

/**
 * Calls `jiniTarget.publish()` and maps its result to a {@link StaticPublishOutcome}, translating a
 * rejected `publish()` call into {@link publishStaticSite}'s own `{ok:false, code:"PROVIDER_ERROR"}`
 * channel.
 *
 * `err.message` only — never `DeployError.details` (the raw upstream response body) or the error
 * object itself. This crosses an HTTP/tool-result boundary (the admin route's JSON response, the
 * agent tool's result), the same "message, never the raw error" discipline `export-site.ts`'s own
 * errored-run summary already follows. No observed code path in `github-pages.ts`/`vercel.ts` puts
 * `credential.token` into a `DeployError` message — verified by reading every `DeployError`
 * construction in both files — but this boundary still holds even if that ever changed upstream.
 */
async function publishAndMapOutcome(
  jiniTarget: DeployTarget,
  publishInput: DeployPublishInput,
  input: StaticPublishInput,
  basePath: string | undefined
): Promise<StaticPublishOutcome> {
  try {
    const result = await jiniTarget.publish(publishInput, { responseHeaders: PUBLIC_PAGE_SECURITY_HEADERS });
    if (result.status !== "ready") {
      return buildPartialPublishOutcome(input.config.target, result, basePath);
    }
    return buildSuccessPublishOutcome(input.config.target, result, basePath);
  } catch (err) {
    const message = err instanceof DeployError || err instanceof Error ? err.message : String(err);
    return { ok: false, code: "PROVIDER_ERROR", message };
  }
}

/**
 * Publishes Tovu's current site content to `input.config.target`. Always runs a fresh, `clean`
 * export with the target-correct base path immediately before publishing (see this file's header)
 * — never reuses a previously-produced export directory.
 *
 * Never throws: every failure (an unknown target or bad config, a registry that will not load, a
 * credential that does not resolve — including a genuine DECRYPT failure, see
 * {@link resolvePublishCredentialForSite} — a failed export, a credential unusable for the target, or
 * a rejected `publish()` call) is returned as `{ok: false, code, message}`. `message` is always built
 * from `err.message`, never a raw `DeployError.details`/response-body object. Every caller
 * (`publish-site.ts`'s HTTP route, `deployment_execute_static_publish`) relies on this.
 *
 * Orchestrates its work as a flat sequence of steps, each translating its own failure mode into this
 * function's `{ok:false, code, message}` channel and returning early: {@link resolvePublishPlan},
 * {@link resolvePublishCredentialForSite}, {@link runExportForPublish}, {@link constructTargetForPublish},
 * then {@link publishAndMapOutcome} for the terminal result.
 *
 * @complexity One registry load, one `exportSite` pass (O(routes + assets) HTTP requests against the
 *   in-process app) plus one `DeployTarget.publish()` call (bounded by that target's own poll budget).
 */
export async function publishStaticSite(deps: StaticPublishDeps, input: StaticPublishInput): Promise<StaticPublishOutcome> {
  if (input.projectName.trim() === "" || input.projectName.length > MAX_PROJECT_NAME_LENGTH) {
    return { ok: false, code: "INVALID_CONFIG", message: `projectName must be 1-${MAX_PROJECT_NAME_LENGTH} characters` };
  }
  const plan = await resolvePublishPlan(deps, input);
  if (!plan.ok) return { ok: false, code: "INVALID_CONFIG", message: plan.message };

  const credentialResult = await resolvePublishCredentialForSite(deps, input);
  if (!credentialResult.ok) {
    return credentialResult.outcome;
  }

  const outputDir = publishOutputDir(input.publishOutputRootDir, input.config.target, input.idGen.newId());
  const exportResult = await runExportForPublish(input, outputDir, plan.basePath);
  if (!exportResult.ok) {
    return exportResult.outcome;
  }

  const files = buildDeployFilesForPublish(exportResult.report);
  const resolvedCredential = toDeployTargetCredential(credentialResult.credential);
  const targetResult = constructTargetForPublish(deps, plan.target, input.config, resolvedCredential);
  if (!targetResult.ok) {
    return targetResult.outcome;
  }

  const publishInput: DeployPublishInput = { files, projectName: input.projectName };
  const outcome = await publishAndMapOutcome(targetResult.target, publishInput, input, plan.basePath);
  // A plugin can include its credential in an error message. Keep the useful provider explanation
  // while removing the resolved token before this site-publish response reaches HTTP or a tool.
  if (!outcome.ok && resolvedCredential.token) {
    return { ...outcome, message: outcome.message.replaceAll(resolvedCredential.token, "[REDACTED]") };
  }
  return outcome;
}

/**
 * Loads this workspace's registry and plans the publish against it. Every registry refusal (a plugin
 * or module that did not load) is logged, never returned: the caller's answer is about ITS target.
 * @complexity One registry load (see `loadDeployTargetRegistry`).
 */
async function resolvePublishPlan(deps: StaticPublishDeps, input: StaticPublishInput): Promise<StaticPublishPlan> {
  let registry: DeployTargetRegistry;
  try {
    registry = await deps.loadDeployTargets(input.workspaceId);
  } catch (err) {
    return { ok: false, message: `publish targets could not be loaded: ${err instanceof Error ? err.message : String(err)}` };
  }
  for (const refusal of registry.refusals) console.warn(`[static-publish] ${refusal}`);
  return planStaticPublish(registry, input.config);
}

/**
 * Adapts an installed module's target to devops' {@link DeployTarget} port. Installed
 * content-addressed modules keep their ABI: security headers still reach the first object, and
 * `checkReachability` takes the bare URL string, so the port's `{ url }` is unwrapped here.
 * @param installedTarget What the plugin module's `create` returned.
 * @returns The same target behind the devops port.
 * @complexity O(1); each call forwards once.
 */
export function adaptInstalledTarget(installedTarget: HostDeployTarget): DeployTarget {
  return {
    id: installedTarget.id,
    publish: (required, optional) => installedTarget.publish({ ...required, ...optional }),
    checkReachability: ({ url }) => installedTarget.checkReachability(url),
  };
}

/**
 * Constructs the `DeployTarget` `publishAndMapOutcome` will call `publish()` on, translating a throw
 * (typically a credential missing a field the host requires) into {@link publishStaticSite}'s own
 * `{ok:false, code}` channel — the message, never the raw error object, since it crosses an
 * HTTP/tool-result boundary.
 * @complexity O(1) plus the module's own construction.
 */
function constructTargetForPublish(
  deps: StaticPublishDeps,
  pluginTarget: LoadedDeployTarget,
  config: StaticPublishConfig,
  credential: ResolvedPublishCredential
): { ok: true; target: DeployTarget } | { ok: false; outcome: StaticPublishOutcome } {
  try {
    if (deps.buildTarget !== undefined) return { ok: true, target: deps.buildTarget(config, credential) };
    const kit = deps.hostKit ?? createDeployHostKit({ observability: deps.observability });
    return { ok: true, target: adaptInstalledTarget(pluginTarget.module.create({ credential, config: config as unknown as UnknownRecord, kit })) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, outcome: { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: `credential is not usable for ${config.target}: ${message}` } };
  }
}
