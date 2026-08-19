import { createRequire } from "node:module";
import path from "node:path";

import {
  CloudflarePagesDeployTarget,
  DeployError,
  GitHubPagesDeployTarget,
  NetlifyDeployTarget,
  VercelDeployTarget,
  type DeployFile,
  type DeployTarget,
} from "@jini-ai/devops/deploy";

import type { ExportReport, ExportSiteOptions } from "#src/export/index";
import type { RouteDeps } from "#src/server/routes/types";

const require = createRequire(import.meta.url);

import { S3CompatibleDeployTarget, type S3CompatibleTargetConfig } from "./s3-compatible-target.js";
import type { GitHubPagesPublishConfig, PublishCredentialSource, StaticPublishConfig, StaticPublishOutcome, StaticPublishTargetId } from "./types.js";

/**
 * @file Wraps `@jini-ai/devops/deploy`'s `GitHubPagesDeployTarget`/`VercelDeployTarget` to publish
 * Tovu's own static export. This is the one file in this feature that imports Jini's deploy
 * types — every caller (the admin route, `publish-agent-tools.ts`) sees only `./types.ts`'s
 * `StaticPublishConfig`/`StaticPublishOutcome`, never a `DeployFile`/`DeployTarget`/`DeployError`
 * (the brief's "keep Jini's types at the boundary" instruction).
 *
 * Purpose:
 * "Wrap it, do not reimplement" — this module does no GitHub/Vercel HTTP itself. It (a) runs
 * Tovu's real static exporter (`src/export`'s `exportSite`, the same engine
 * `routes/admin/system/export-site.ts` already drives) with a base path computed FOR the publish
 * target, (b) maps the resulting `ExportReport` into `DeployFile[]` using the `data`/`outputFile`
 * fields `site-exporter.ts` added specifically for this ("reachable as DATA for a future
 * deploy-shaped caller" — see that file's own header), (c) injects `.nojekyll` for the GitHub
 * Pages target only, and (d) hands the file set to the matching Jini `DeployTarget`.
 *
 * Base-path/target mismatch, made structurally impossible rather than merely documented
 * (brief item 5): `StaticPublishConfig` (`./types.ts`) has NO `basePath` field at all — a caller
 * can never supply one, correct or not. {@link computeBasePath} derives it deterministically from
 * `config.repo` for GitHub Pages (`/${repo}`, the exact prefix a GitHub Pages PROJECT site serves
 * from) and returns `undefined` for Vercel (which serves from the root and must never carry one).
 * {@link publishStaticSite} then always runs a FRESH `exportSite` call with that exact value,
 * immediately before publishing — there is no code path where a previously-produced export (built
 * with some other or no base path) can reach a Jini target under this module. The cost is a full
 * re-export on every publish rather than reusing a prior one; accepted deliberately, since a stale
 * base path silently 404ing every asset on a live site is a strictly worse failure mode than one
 * extra export pass on an already-slow, human-triggered, one-at-a-time operation.
 *
 * How it relates to the project:
 * `.nojekyll`'s necessity is `@jini-ai/devops`'s own documented gap, not a Tovu invention — GitHub
 * Pages runs Jekyll over published content by default, which silently drops any path segment
 * starting with `_` (a real risk: Tovu's theme-asset/media-rendition URL shapes are not guaranteed
 * underscore-free), and `github-pages.ts` does not add this marker file itself (verified: zero
 * matches for "jekyll" anywhere in `@jini-ai/devops`).
 *
 * A refused export (any route failed) never reaches a Jini target at all — this module will not
 * publish a known-incomplete site, mirroring `cli/commands/export.ts`'s own
 * `ok = routes.failed.length === 0` honesty contract one layer up.
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic, this feature's one seam into
 * `@jini-ai/devops/deploy`. No dependency on `../ports.ts`/`../providers/github.ts` (the sibling
 * continuous-deployment feature) — see `./types.ts`'s header for why these stay separate.
 */

/** Empty marker file GitHub Pages checks for to skip its default Jekyll processing pass — see this
 *  file's header. Never varies per publish, so it is a fixed constant, not computed per call. */
const NOJEKYLL_FILE: DeployFile = { file: ".nojekyll", data: "" };

/** GitHub owner/org name: alphanumeric, may contain single hyphens, cannot start with one, capped
 *  at GitHub's own 39-character username limit — deliberately not the full GitHub validation
 *  surface, just enough to refuse control characters, path separators, and other injection-shaped
 *  values from a model- or form-supplied string before it reaches a URL. */
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** GitHub repo name: letters, digits, `.`/`-`/`_`, capped at GitHub's own 100-character limit. */
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
/** Git branch name — deliberately permissive (Git branch names allow far more than this), but
 *  still refuses whitespace/control characters before the value reaches a URL path segment. */
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,250}$/;
const MAX_PROJECT_NAME_LENGTH = 200;

/**
 * Validates `config`'s target-specific fields. Every accepted field still passes through Jini's
 * OWN `encodeURIComponent`-based escaping (`github-pages.ts`'s `enc()`) before reaching a URL — this
 * is a defense-in-depth shape check at Tovu's own boundary, not a substitute for that escaping.
 *
 * @returns `null` when valid, else a human-readable reason safe to return over an HTTP/tool
 *   boundary (never echoes more than the offending field, capped, never a token — there is none in
 *   scope here).
 * @complexity O(1) — a handful of fixed-size regex tests.
 */
export function validateStaticPublishConfig(config: StaticPublishConfig): string | null {
  if (config.target === "github-pages") {
    if (!OWNER_PATTERN.test(config.owner)) return `invalid GitHub owner '${config.owner.slice(0, 60)}'`;
    if (!REPO_PATTERN.test(config.repo) || config.repo === "." || config.repo === "..") {
      return `invalid GitHub repo '${config.repo.slice(0, 100)}'`;
    }
    if (config.branch !== undefined && !BRANCH_PATTERN.test(config.branch)) {
      return `invalid branch name '${config.branch.slice(0, 60)}'`;
    }
    return null;
  }
  if (config.target === "vercel") {
    if (config.teamId !== undefined && config.teamId.trim() === "") {
      return "teamId must not be blank when provided";
    }
    return null;
  }
  // config.target === "netlify" | "cloudflare-pages" — neither carries a target-specific field to
  // validate here. Cloudflare Pages' `accountId` is HARD required, but it lives on the CREDENTIAL
  // (`publish-credentials/types.ts`'s `CloudflarePagesConnectionInput`), not this config — see
  // `types.ts`'s `CloudflarePagesPublishConfig` doc for why, and `store.ts`'s `validateConnection`
  // for where that field is actually enforced (at credential-save time, not publish time).
  return null;
}

/** See this file's header — the one place the base path is decided, and the one caller that ever
 *  passes a base path into `exportSite`. Exported so `publish-agent-tools.ts`'s preview tool can
 *  report the SAME computed value a real publish would use, without duplicating the derivation. */
export function computeBasePath(config: StaticPublishConfig): string | undefined {
  return config.target === "github-pages" ? `/${config.repo}` : undefined;
}

/** Each publish target gets its OWN directory under `infra/` (the Docker-volume-mounted directory
 *  every other export/publish artifact already lives under) so a GitHub Pages publish and a Vercel
 *  publish never race over the same on-disk output — relevant even though {@link publishStaticSite}
 *  is one-at-a-time per the admin route's own concurrency guard, since this function has no such
 *  guard of its own and may gain a second caller later.
 *
 * `parent` is `RouteDeps.publishOutputRootDir` (`TOVU_PUBLISH_DIR` env, then `infra/publish` —
 * mirroring `export-site.ts`'s own `TOVU_EXPORT_DIR` knob), resolved ONCE by the composition root
 * (`server/app.ts`/`server/deps.ts`) and threaded through {@link publishStaticSite}'s
 * `input.routeDeps` — never read from `process.env` in this file. A test overrides it the same way
 * every other `RouteDeps` field is overridden: by setting `publishOutputRootDir` on the fake
 * `RouteDeps` it constructs, not by mutating real process env vars. */
function publishOutputDir(parent: string, target: StaticPublishTargetId): string {
  return path.join(parent, target);
}

/** Normalizes an `ExportedRoute`/`ExportedAsset`'s `outputFile` (already deploy-relative, per that
 *  interface's own doc) to forward slashes — `path.relative` uses the platform separator, and every
 *  deploy target in `@jini-ai/devops` treats `DeployFile.file` as a literal repo/deployment path,
 *  where a stray backslash on a Windows host would be be a wrong path, not a normalized one. */
export function toDeployFile(entry: { outputFile: string; data: string | Buffer; contentType?: string }): DeployFile {
  return {
    file: entry.outputFile.split(path.sep).join("/"),
    data: entry.data,
    ...(entry.contentType !== undefined ? { contentType: entry.contentType } : {}),
  };
}

/** The resolved credential a real `DeployTarget` is built from — `token` for every provider, plus
 *  `accountId` for `cloudflare-pages` only, and five more optional fields for `s3-compatible` only
 *  (see `types.ts`'s `PublishCredentialSource.resolve()` doc for the full reasoning on both). */
export type ResolvedPublishCredential = {
  readonly token: string;
  readonly accountId?: string;
  readonly accessKeyId?: string;
  readonly bucket?: string;
  readonly region?: string;
  readonly endpoint?: string;
  readonly publicUrl?: string;
};

/** The four fields `S3CompatibleTargetConfig` needs beyond `token`/`secretAccessKey` — checked as a
 *  group by {@link buildS3CompatibleTargetConfig}. */
const REQUIRED_S3_CREDENTIAL_FIELDS = ["accessKeyId", "bucket", "region", "publicUrl"] as const;

/**
 * Maps a resolved credential into `S3CompatibleTargetConfig`. Defense-in-depth, same reasoning
 * `buildJiniTarget`'s cloudflare-pages branch already documents for its own `accountId` guard:
 * `publish-credentials/store.ts`'s `validateConnection` already enforces every one of these fields is
 * non-blank at credential-save time, so a DB-backed credential that reaches this point always has
 * them — this guard is for a future `PublishCredentialSource` implementation that does not uphold that
 * contract. Exported so this mapping is directly testable without constructing a real
 * `S3CompatibleDeployTarget` (which would need a real `fetch`) — mirrors this file's own
 * `computeBasePath`/`toDeployFile` precedent of extracting a pure, directly-tested helper out of a
 * larger dispatch function.
 *
 * @throws {DeployError} Any of {@link REQUIRED_S3_CREDENTIAL_FIELDS} is missing from `credential`.
 * @complexity O(1) — a fixed-size field check plus a fixed-shape object literal.
 * @overallScore 100
 */
export function buildS3CompatibleTargetConfig(credential: ResolvedPublishCredential): S3CompatibleTargetConfig {
  const missing = REQUIRED_S3_CREDENTIAL_FIELDS.filter((field) => credential[field] === undefined);
  if (missing.length > 0) {
    throw new DeployError(`S3-compatible credential is missing required field(s): ${missing.join(", ")}.`, 400);
  }
  return {
    accessKeyId: credential.accessKeyId!,
    secretAccessKey: credential.token,
    bucket: credential.bucket!,
    region: credential.region!,
    publicUrl: credential.publicUrl!,
    ...(credential.endpoint !== undefined ? { endpoint: credential.endpoint } : {}),
  };
}

/** The real, default `buildTarget` — constructs the actual Jini `DeployTarget` that will hit the
 *  provider's real API. `StaticPublishDeps.buildTarget` exists specifically so a test can substitute
 *  a fake `DeployTarget` here instead (per the brief: "adapter tests with a faked deploy target — do
 *  not hit real GitHub or Vercel in tests"), without needing to stub global `fetch`. */
function buildJiniTarget(config: StaticPublishConfig, credential: ResolvedPublishCredential): DeployTarget {
  const token = credential.token;
  if (config.target === "github-pages") {
    const githubConfig = config as GitHubPagesPublishConfig;
    return new GitHubPagesDeployTarget({
      token,
      owner: githubConfig.owner,
      repo: githubConfig.repo,
      ...(githubConfig.branch !== undefined ? { branch: githubConfig.branch } : {}),
    });
  }
  if (config.target === "vercel") {
    return new VercelDeployTarget({ token, ...(config.teamId !== undefined ? { teamId: config.teamId } : {}) });
  }
  if (config.target === "netlify") {
    // No `siteId`/site-selection field to forward — Jini's `NetlifyDeployTarget` config is `{token}`
    // only; see `types.ts`'s `NetlifyPublishConfig` doc for the full reasoning (it always
    // find-or-creates a site from `publishStaticSite`'s own `projectName` argument instead).
    return new NetlifyDeployTarget({ token });
  }
  // config.target === "cloudflare-pages" — `accountId` comes from the resolved CREDENTIAL, never the
  // config (see `ResolvedPublishCredential`'s own doc). `store.ts`'s `validateConnection` already
  // enforces `accountId` is non-blank at credential-save time, so any DB-backed credential that
  // reaches this point has one; the env-backed source's own `readCredential` enforces the same
  // before ever reporting `ok: true` (see `credentials.ts`). This guard is defense-in-depth against a
  // future `PublishCredentialSource` implementation that does not uphold that contract.
  if (config.target === "cloudflare-pages") {
    if (!credential.accountId) {
      throw new DeployError("Cloudflare account ID is required but was not resolved from the saved credential.", 400);
    }
    return new CloudflarePagesDeployTarget({ token, accountId: credential.accountId });
  }
  // config.target === "s3-compatible" — every identifying field comes from the resolved CREDENTIAL,
  // never this config (`S3CompatiblePublishConfig` is deliberately empty — see `types.ts`'s own doc).
  return new S3CompatibleDeployTarget(buildS3CompatibleTargetConfig(credential));
}

export interface StaticPublishDeps {
  readonly credentialSource: PublishCredentialSource;
  /** Builds the `DeployTarget` that `publish()` is called on. Defaults to {@link buildJiniTarget}
   *  (the real Jini adapters) when omitted — tests inject a fake here instead of touching
   *  GitHub/Vercel or global `fetch`. */
  readonly buildTarget?: (config: StaticPublishConfig, credential: ResolvedPublishCredential) => DeployTarget;
}

export interface StaticPublishInput {
  readonly workspaceId: RouteDeps["workspaceId"];
  /** The same composition-root object `exportSite` itself needs (`ExportSiteOptions.routeDeps`) —
   *  this function boots and fetches the real app exactly like a plain export does, immediately
   *  before publishing. */
  readonly routeDeps: RouteDeps;
  readonly config: StaticPublishConfig;
  /** Human-facing label — becomes the GitHub commit message subject / the Vercel project-name seed.
   *  Sanitized further by Jini's own `safeProjectLabel`/`safeVercelProjectName`; validated here only
   *  for length and non-blankness. */
  readonly projectName: string;
}

/**
 * `exportSite`, resolved at CALL time instead of at import time — mirrors `server/app.ts`'s own
 * `runExportSiteLazily` (see that function's doc for the fuller crash trace this is the same class
 * of bug as). A static `import { exportSite } from "#src/export/index"` at the top of THIS file
 * closes a cycle the moment anything reachable from `src/assistant` imports this module:
 *
 *     assistant/tool-registrations.ts -> features/deployments/publish-agent-tools.ts ->
 *     static-publish/index.ts -> static-publish/adapter.ts -> export/index.ts ->
 *     export/site-exporter.ts -> server/app.ts -> ... (back into `src/assistant`)
 *
 * That edge went live 2026-08-15 when `deployment_preview_static_publish` was wired into
 * `assistant/tool-registrations.ts`'s `DOMAIN_SLICES` — this file was never reachable from
 * `src/assistant` before that. Observed failure importing `assistant/tool-registrations.ts` with
 * the eager import still in place: `ReferenceError: Cannot access 'staticPublishDerivedRisk' before
 * initialization` (this file's own top-level exports were still mid-initialisation when the cycle
 * looped back). The preview tool never calls this at all — only {@link publishStaticSite} does, and
 * only a real publish (never agent-reachable; see `publish-agent-tools.ts`'s header) reaches it.
 *
 * `require` (via `createRequire`) rather than `await import`: a synchronous resolution keeps this
 * function's signature a plain `(options) => Promise<ExportReport>` rather than forcing every
 * caller to await an extra layer. By the time anything calls this, both modules are fully loaded,
 * so there is no partial-initialisation window left to fall into.
 */
function exportSiteLazily(options: ExportSiteOptions): Promise<ExportReport> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see doc above.
  return (require("#src/export/index") as typeof import("#src/export/index")).exportSite(options);
}

/**
 * Publishes Tovu's current site content to `input.config.target`. Always runs a fresh, `clean`
 * export with the target-correct base path immediately before publishing (see this file's header)
 * — never reuses a previously-produced export directory.
 *
 * Never throws: every failure (bad config, a credential that does not resolve — including a genuine
 * DECRYPT failure, not just "not configured", see the `try`/`catch` around `credentialSource.resolve()`
 * below — a failed export, a credential unusable for the target, or a rejected Jini `publish()` call)
 * is returned as `{ok: false, code, message}`. `message` is always built from `err.message`, never a
 * raw `DeployError.details`/response-body object — see the `catch` blocks below for why that boundary
 * matters even though no code path here has ever been observed to put a token in one.
 *
 * This is a REAL contract, not aspirational (Terra audit finding #2, 2026-08-16 fix): two call sites —
 * `credentialSource.resolve()` and `buildTarget`/`buildJiniTarget` — used to run unguarded, before
 * either of this function's two `try` blocks existed around them, so a genuine decrypt failure or a
 * credential missing a target-required field propagated as an UNCAUGHT exception, silently breaking
 * this exact doc comment. Every caller (`publish-site.ts`'s HTTP route, `deployment_execute_static_publish`)
 * is written assuming this function never throws, so that was a real crash risk for both, not just a
 * documentation lie — both call sites are now inside their own `try`/`catch`.
 *
 * @complexity One `exportSite` pass (see that function's own complexity note: O(routes + assets)
 *   HTTP requests against the in-process app) plus one Jini `DeployTarget.publish()` call (bounded
 *   by that target's own fixed poll budget, ~30 attempts / up to ~1 minute).
 */
export async function publishStaticSite(deps: StaticPublishDeps, input: StaticPublishInput): Promise<StaticPublishOutcome> {
  const configError = validateStaticPublishConfig(input.config);
  if (configError) {
    return { ok: false, code: "INVALID_CONFIG", message: configError };
  }
  if (input.projectName.trim() === "" || input.projectName.length > MAX_PROJECT_NAME_LENGTH) {
    return { ok: false, code: "INVALID_CONFIG", message: `projectName must be 1-${MAX_PROJECT_NAME_LENGTH} characters` };
  }

  let credential: Awaited<ReturnType<PublishCredentialSource["resolve"]>>;
  try {
    credential = await deps.credentialSource.resolve({ workspaceId: input.workspaceId, target: input.config.target });
  } catch (err) {
    // `PublishCredentialSource.resolve()`'s own doc documents this as a real, DELIBERATE possibility
    // for the DB-backed source (`publish-credentials/store.ts`'s `resolveForPublish`/
    // `resolveDefaultForPublish`: "a decrypt failure here should surface, not degrade" — a corrupted
    // row or a missing master secret throws rather than resolving a silent `null`). This function's
    // own contract (this file's header doc, right above) is that IT never throws regardless — so a
    // genuine decrypt failure still needs to "surface", just through this function's own established
    // `{ok:false, code, message}` channel instead of an uncaught exception, exactly like every other
    // failure mode below. `err.message` only, same boundary the `jiniTarget.publish()` catch documents
    // — a decrypt failure's message names the mechanism (bad AAD, tampered ciphertext, missing key),
    // never the ciphertext or a derived secret itself.
    return { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: `credential could not be resolved: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!credential.ok) {
    return { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: credential.reason };
  }

  const basePath = computeBasePath(input.config);
  const outputDir = publishOutputDir(input.routeDeps.publishOutputRootDir, input.config.target);

  let report: ExportReport;
  try {
    report = await exportSiteLazily({ routeDeps: input.routeDeps, outputDir, clean: true, ...(basePath !== undefined ? { basePath } : {}) });
  } catch (err) {
    return {
      ok: false,
      code: "EXPORT_FAILED",
      message: `export failed before publishing could start: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (report.routes.failed.length > 0) {
    const first = report.routes.failed[0]!;
    return {
      ok: false,
      code: "EXPORT_FAILED",
      message: `refused to publish: ${report.routes.failed.length} route(s) failed to export (first: '${first.path}' — ${first.reason})`,
    };
  }

  const files: DeployFile[] = [...report.routes.succeeded.map(toDeployFile), ...report.assets.succeeded.map(toDeployFile)];
  if (input.config.target === "github-pages") {
    files.push(NOJEKYLL_FILE);
  }

  const resolvedCredential: ResolvedPublishCredential = {
    token: credential.token,
    ...(credential.accountId !== undefined ? { accountId: credential.accountId } : {}),
    ...(credential.accessKeyId !== undefined ? { accessKeyId: credential.accessKeyId } : {}),
    ...(credential.bucket !== undefined ? { bucket: credential.bucket } : {}),
    ...(credential.region !== undefined ? { region: credential.region } : {}),
    ...(credential.endpoint !== undefined ? { endpoint: credential.endpoint } : {}),
    ...(credential.publicUrl !== undefined ? { publicUrl: credential.publicUrl } : {}),
  };
  let jiniTarget: DeployTarget;
  try {
    // `buildJiniTarget` throws a `DeployError` naming the exact missing field when `resolvedCredential`
    // doesn't have what `input.config.target` needs (e.g. `buildS3CompatibleTargetConfig`'s own
    // defense-in-depth throw, or a cloudflare-pages credential missing `accountId`) — a shape problem
    // with the CREDENTIAL, not a live provider rejection, so it is caught here rather than left to
    // propagate: `NO_CREDENTIALS_CONFIGURED` is the closest existing code (this file has no dedicated
    // "credential is configured but malformed for this target" code, and adding one is a wider API
    // change than this fix), same bucket `deps.credentialSource.resolve()`'s own catch above uses for
    // an analogous "the credential exists but cannot be used" outcome.
    jiniTarget = (deps.buildTarget ?? buildJiniTarget)(input.config, resolvedCredential);
  } catch (err) {
    const message = err instanceof DeployError || err instanceof Error ? err.message : String(err);
    return { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: `credential is not usable for ${input.config.target}: ${message}` };
  }

  try {
    const result = await jiniTarget.publish({ files, projectName: input.projectName });

    // `result.status` is EVERY target's own honest terminal state (`DeployLinkStatus`) — not merely
    // "did the API call succeed". A status other than 'ready' means the provider accepted the publish
    // but the site is not (yet, or ever, without a further step outside this call) reachable — spec
    // `custom-publish-provider-contract.md` §3a's "uploaded, but not yet reachable" requirement,
    // required regardless of provider once `StaticPublishOutcome` carries a real third branch for it
    // (see that type's own header). Applied uniformly here rather than special-cased per target: every
    // target already resolves its own `status` internally before returning (verified directly against
    // `VercelDeployTarget.publish()`'s own `waitForReachableDeploymentUrl` call), so this is the one
    // place that turns an already-honest `status` into an equally-honest `StaticPublishOutcome`.
    if (result.status !== "ready") {
      return {
        ok: "partial",
        targetId: input.config.target,
        url: result.url,
        status: result.status,
        message:
          result.statusMessage ??
          `Published to ${input.config.target}, but the public URL is not confirmed reachable yet (status: ${result.status}).`,
        ...(result.deploymentId !== undefined ? { deploymentId: result.deploymentId } : {}),
        ...(basePath !== undefined ? { basePath } : {}),
      };
    }

    return {
      ok: true,
      targetId: input.config.target,
      url: result.url,
      status: result.status,
      ...(result.deploymentId !== undefined ? { deploymentId: result.deploymentId } : {}),
      ...(basePath !== undefined ? { basePath } : {}),
    };
  } catch (err) {
    // `err.message` only — never `DeployError.details` (the raw upstream response body) or the
    // error object itself. This crosses an HTTP/tool-result boundary (the admin route's JSON
    // response, the agent tool's result), the same "message, never the raw error" discipline
    // `export-site.ts`'s own errored-run summary already follows. No observed code path in
    // `github-pages.ts`/`vercel.ts` puts `credential.token` into a `DeployError` message — verified
    // by reading every `DeployError` construction in both files — but this boundary still holds even
    // if that ever changed upstream.
    const message = err instanceof DeployError || err instanceof Error ? err.message : String(err);
    return { ok: false, code: "PROVIDER_ERROR", message };
  }
}
