import path from "node:path";

import {
  DeployError,
  GitHubPagesDeployTarget,
  VercelDeployTarget,
  type DeployFile,
  type DeployTarget,
} from "@jini-ai/devops/deploy";

import { exportSite, type ExportReport } from "#src/export/index";
import type { RouteDeps } from "#src/server/routes/types";

import type { GitHubPagesPublishConfig, PublishCredentialSource, StaticPublishConfig, StaticPublishOutcome, StaticPublishTargetId } from "./types";

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
  if (config.teamId !== undefined && config.teamId.trim() === "") {
    return "teamId must not be blank when provided";
  }
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
 * `TOVU_PUBLISH_DIR` overrides the `infra/publish` parent, mirroring `export-site.ts`'s own
 * `TOVU_EXPORT_DIR` knob — a real operational knob (an operator may want this on a different
 * volume/tmpfs), and what lets this module's own tests redirect off the checked-out repo without
 * a test-only code path. */
function publishOutputDir(target: StaticPublishTargetId): string {
  const parent = process.env.TOVU_PUBLISH_DIR !== undefined ? path.resolve(process.env.TOVU_PUBLISH_DIR) : path.resolve(process.cwd(), "infra", "publish");
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

/** The real, default `buildTarget` — constructs the actual Jini `DeployTarget` that will hit
 *  GitHub/Vercel's real API. `StaticPublishDeps.buildTarget` exists specifically so a test can
 *  substitute a fake `DeployTarget` here instead (per the brief: "adapter tests with a faked deploy
 *  target — do not hit real GitHub or Vercel in tests"), without needing to stub global `fetch`. */
function buildJiniTarget(config: StaticPublishConfig, token: string): DeployTarget {
  if (config.target === "github-pages") {
    const githubConfig = config as GitHubPagesPublishConfig;
    return new GitHubPagesDeployTarget({
      token,
      owner: githubConfig.owner,
      repo: githubConfig.repo,
      ...(githubConfig.branch !== undefined ? { branch: githubConfig.branch } : {}),
    });
  }
  return new VercelDeployTarget({ token, ...(config.teamId !== undefined ? { teamId: config.teamId } : {}) });
}

export interface StaticPublishDeps {
  readonly credentialSource: PublishCredentialSource;
  /** Builds the `DeployTarget` that `publish()` is called on. Defaults to {@link buildJiniTarget}
   *  (the real Jini adapters) when omitted — tests inject a fake here instead of touching
   *  GitHub/Vercel or global `fetch`. */
  readonly buildTarget?: (config: StaticPublishConfig, token: string) => DeployTarget;
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
 * Publishes Tovu's current site content to `input.config.target`. Always runs a fresh, `clean`
 * export with the target-correct base path immediately before publishing (see this file's header)
 * — never reuses a previously-produced export directory.
 *
 * Never throws: every failure (bad config, missing credentials, a failed export, a rejected Jini
 * `publish()` call) is returned as `{ok: false, code, message}`. `message` is always built from
 * `err.message`, never a raw `DeployError.details`/response-body object — see the `catch` below for
 * why that boundary matters even though no code path here has ever been observed to put a token in
 * one.
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

  const credential = await deps.credentialSource.resolve({ workspaceId: input.workspaceId, target: input.config.target });
  if (!credential.ok) {
    return { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: credential.reason };
  }

  const basePath = computeBasePath(input.config);
  const outputDir = publishOutputDir(input.config.target);

  let report: ExportReport;
  try {
    report = await exportSite({ routeDeps: input.routeDeps, outputDir, clean: true, ...(basePath !== undefined ? { basePath } : {}) });
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

  const jiniTarget = (deps.buildTarget ?? buildJiniTarget)(input.config, credential.token);

  try {
    const result = await jiniTarget.publish({ files, projectName: input.projectName });
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
