import type { Express } from "express";

import {
  computeBasePath,
  composePublishCredentialSource,
  getPublishRunSnapshot,
  startPublishRun,
  validateStaticPublishConfig,
  type StaticPublishConfig,
} from "#src/features/deployments/static-publish/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Deployment panel → publish-to-GitHub-Pages/Vercel backend.
 *
 * Registers TWO routes, deliberately mirroring `./export-site.ts`'s own trigger+status shape
 * almost exactly (see that file's header for the full reasoning this route inherits): a publish
 * runs a fresh in-process export (see `static-publish/adapter.ts`'s `publishStaticSite`) and then
 * blocks on an external provider's own build/deploy pipeline — GitHub Pages' build poll or Vercel's
 * deployment poll, each up to roughly a minute — so `POST .../system/publish` starts the run and
 * returns `202` immediately with a snapshot; `GET .../system/publish` polls the same snapshot. The
 * single process-local mutable slot backing both lives in `static-publish/publish-run.ts` (2026-08-16,
 * Terra audit finding #1 — see that file's header for the full "who shares this slot and why" story),
 * NOT in this file — a plain export's own slot (`export-site.ts`'s `currentRun`, in `export-run.ts`)
 * stays independent (a plain export and a publish are different operations that may legitimately need
 * independent status), but THIS route's own slot is now shared with `deployment_execute_static_publish`
 * (`publish-agent-tools.ts`), which used to call `publishStaticSite` directly with nothing to check at
 * all — the actual gap the finding was about.
 *
 * `system.publish`-gated for BOTH the trigger and the status poll — deliberately NOT split into a
 * `system.publish`/`system.read` pair the way `export-site.ts` splits trigger/status. Reasoning: a
 * completed publish's status snapshot names the exact external `url` this workspace's content is
 * now live at (`StaticPublishOutcome`'s `url` field) and, on a validation failure, can echo back the
 * caller-supplied `owner`/`repo`/`teamId`. Export's status is comparatively inert (counts and local
 * file paths); publish's status is itself operationally sensitive information about a live external
 * resource, so it gets the stricter, single-permission gate.
 *
 * Request body for the trigger: `{ target: "github-pages"|"vercel"|"netlify"|"cloudflare-pages",
 * projectName: string, owner?, repo?, branch?, teamId? }` — `owner`/`repo`/`branch` apply only to
 * `github-pages`, `teamId` only to `vercel`; `netlify`/`cloudflare-pages` use none of the four (see
 * `parsePublishRequestBody`'s own per-target branches below). Every field is validated by
 * `publishStaticSite` itself
 * (`static-publish/adapter.ts`'s `validateStaticPublishConfig`) — this route's own parsing only
 * narrows JSON shape (right types, right target-specific fields present), never re-implements that
 * validation, so there is exactly one place a config is judged valid or not.
 *
 * A THIRD route, `GET .../system/publish/preview`, was added 2026-08-15 alongside the admin UI's
 * Static Site tab publish card. `deployment_preview_static_publish` (`publish-agent-tools.ts`)
 * already gives the ASSISTANT this exact read — target validity, the computed base path, and
 * whether a credential is configured (a boolean only, never the token) — but that tool is reached
 * over the agent-tool transport, not an HTTP route a browser session can call, and the admin UI has
 * no other way to answer "would this publish work?" before spending a real trigger+run on the
 * question. This route reuses the SAME pure functions the tool already calls
 * (`computeBasePath`/`validateStaticPublishConfig` from `static-publish/adapter.ts`, this file's own
 * `credentialSource`) rather than re-deriving any of that logic a third time, so a preview here and
 * a preview from the assistant can never disagree. `system.read`-gated, matching every other GET in
 * this directory (`export-site.ts`, `deployment-overview.ts`) — it performs zero writes, zero
 * network calls, and zero filesystem access; the credential check is a `process.env` read.
 */
export type AdminPublishSiteDeps = RouteDeps;

// `PublishRunStatus`/`PublishRunSnapshot` used to be declared here, backing a PRIVATE module-scope
// `currentRun` this file alone could see or update. Both now live in `static-publish/publish-run.ts`,
// and this route reads/writes the run through that module's `getPublishRunSnapshot`/`startPublishRun`
// instead of a local variable — see this file's header for why (Terra audit finding #1:
// `deployment_execute_static_publish` had no equivalent slot to check at all).

/** No longer a module-scope constant (2026-08-15): `createEnvPublishCredentialSource` is now bound
 *  to one workspace at construction time (Terra's finding — it used to accept and ignore
 *  `workspaceId`), and `composePublishCredentialSource` layers the encrypted DB-backed source on top
 *  per the install's `PublishExecutionMode`. Both need `deps`, which is only available inside
 *  {@link registerAdminPublishSiteRoutes} — see that function's own first lines for where this is now
 *  built. */

/**
 * Parses and shape-validates the trigger request body. Never throws — every malformed shape maps to
 * a `{ok:false, error}` result this route turns into a `400`, matching `export-site.ts`'s own
 * `parseTriggerRequestBody` discipline. Field-level VALUE validation (a bad owner/repo/branch
 * pattern) is deliberately NOT duplicated here — that happens exactly once, inside
 * `publishStaticSite` -> `validateStaticPublishConfig`, so a caller only ever gets one canonical
 * rejection message for the same bad value.
 */
function parsePublishRequestBody(body: unknown): { ok: true; config: StaticPublishConfig; projectName: string } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.projectName !== "string" || raw.projectName.trim() === "") {
    return { ok: false, error: "'projectName' (non-empty string) is required" };
  }

  if (raw.target === "github-pages") {
    if (typeof raw.owner !== "string" || raw.owner.trim() === "") return { ok: false, error: "'owner' (non-empty string) is required for target 'github-pages'" };
    if (typeof raw.repo !== "string" || raw.repo.trim() === "") return { ok: false, error: "'repo' (non-empty string) is required for target 'github-pages'" };
    if (raw.branch !== undefined && typeof raw.branch !== "string") return { ok: false, error: "'branch' must be a string" };
    return {
      ok: true,
      config: { target: "github-pages", owner: raw.owner, repo: raw.repo, ...(typeof raw.branch === "string" ? { branch: raw.branch } : {}) },
      projectName: raw.projectName,
    };
  }
  if (raw.target === "vercel") {
    if (raw.teamId !== undefined && typeof raw.teamId !== "string") return { ok: false, error: "'teamId' must be a string" };
    return {
      ok: true,
      config: { target: "vercel", ...(typeof raw.teamId === "string" ? { teamId: raw.teamId } : {}) },
      projectName: raw.projectName,
    };
  }
  if (raw.target === "netlify") {
    return { ok: true, config: { target: "netlify" }, projectName: raw.projectName };
  }
  if (raw.target === "cloudflare-pages") {
    // No target-specific field to parse — `accountId` lives on the CREDENTIAL, resolved by
    // `credentialSource` below, never on the publish config; see `static-publish/types.ts`'s
    // `CloudflarePagesPublishConfig` doc.
    return { ok: true, config: { target: "cloudflare-pages" }, projectName: raw.projectName };
  }
  return { ok: false, error: "'target' must be one of: github-pages, vercel, netlify, cloudflare-pages" };
}

/**
 * Parses the preview GET's query string into a {@link StaticPublishConfig} — the same
 * target-discriminated shape {@link parsePublishRequestBody} reads from a JSON body, translated to
 * `req.query` since this is a plain read with no request body. Deliberately has no `projectName`
 * counterpart: a preview never starts a run, so there is no label to validate.
 *
 * @returns `{ok:false, error}` for a missing/unrecognized `target` or a missing required
 *   target-specific field. VALUE validation (a malformed owner/repo/branch) is intentionally not
 *   duplicated here — {@link validateStaticPublishConfig} is the one place that judges a value valid,
 *   same discipline {@link parsePublishRequestBody}'s own doc comment states for the trigger route.
 * @complexity O(1) — fixed-size field reads, no iteration.
 */
function parsePreviewQuery(query: Record<string, unknown>): { ok: true; config: StaticPublishConfig } | { ok: false; error: string } {
  if (query.target === "github-pages") {
    const owner = typeof query.owner === "string" ? query.owner : "";
    const repo = typeof query.repo === "string" ? query.repo : "";
    if (owner.trim() === "") return { ok: false, error: "'owner' (non-empty string) is required for target 'github-pages'" };
    if (repo.trim() === "") return { ok: false, error: "'repo' (non-empty string) is required for target 'github-pages'" };
    const branch = typeof query.branch === "string" && query.branch.trim() !== "" ? query.branch : undefined;
    return { ok: true, config: { target: "github-pages", owner, repo, ...(branch !== undefined ? { branch } : {}) } };
  }
  if (query.target === "vercel") {
    const teamId = typeof query.teamId === "string" && query.teamId.trim() !== "" ? query.teamId : undefined;
    return { ok: true, config: { target: "vercel", ...(teamId !== undefined ? { teamId } : {}) } };
  }
  if (query.target === "netlify") {
    return { ok: true, config: { target: "netlify" } };
  }
  if (query.target === "cloudflare-pages") {
    // No target-specific field — same reasoning as `parsePublishRequestBody`'s own cloudflare-pages
    // branch above.
    return { ok: true, config: { target: "cloudflare-pages" } };
  }
  return { ok: false, error: "'target' query param must be one of: github-pages, vercel, netlify, cloudflare-pages" };
}

export function registerAdminPublishSiteRoutes(app: Express, deps: AdminPublishSiteDeps): void {
  // Built once per `registerAdminPublishSiteRoutes` call (this route file's own registration is
  // itself a once-per-process composition step), bound to `deps.workspaceId` — see
  // `static-publish/credentials.ts`'s `composePublishCredentialSource` header for the DB-first,
  // env-fallback-only-when-self-hosted composition this now performs.
  const credentialSource = composePublishCredentialSource({
    workspaceId: deps.workspaceId,
    executionMode: deps.publishExecutionMode,
    dbDeps: { repo: deps.publishCredentialSetRepo, sealer: deps.siteAssistantSecretSealer },
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/system/publish", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "system.publish",
        workspaceId: deps.workspaceId,
        entityType: "site-publish",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'system.publish' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "system.publish", reason: authResult.reason },
        });
        return;
      }

      // No `await` between this check and `startPublishRun` below — same single-synchronous-stretch
      // reasoning `export-site.ts`'s own trigger route documents, so two concurrent POSTs cannot both
      // observe "idle". This is now ALSO the same guard `deployment_execute_static_publish`
      // (`publish-agent-tools.ts`) checks before its own confirmed publish call — both read/write the
      // ONE shared slot in `static-publish/publish-run.ts`, so a concurrent trigger from either caller
      // is refused, not raced (Terra audit finding #1).
      if (getPublishRunSnapshot().status === "running") {
        res.status(409).json({ error: "a publish is already running", run: getPublishRunSnapshot() });
        return;
      }

      const parsed = parsePublishRequestBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      // Fails fast, before flipping the shared run slot to "running" or touching the
      // filesystem/network at all, on a config `publishStaticSite` would reject anyway — an explicit
      // early validation pass costs nothing extra here (the same check `publishStaticSite` performs
      // internally) and means a caller who only sends a malformed config never sees a "running"
      // snapshot at all.
      const configError = validateStaticPublishConfig(parsed.config);
      if (configError) {
        res.status(400).json({ error: configError });
        return;
      }

      // Deliberately not awaited — see this file's header for why the response returns before the
      // publish finishes. `startPublishRun` itself keeps the shared slot in sync as the publish
      // settles, so a poller can never observe a stale "running" snapshot after the promise has
      // actually settled.
      const snapshot = startPublishRun(
        { credentialSource },
        {
          workspaceId: deps.workspaceId,
          publishOutputRootDir: deps.publishOutputRootDir,
          idGen: deps.idGen,
          exportSiteBound: deps.exportSiteBound,
          config: parsed.config,
          projectName: parsed.projectName,
        },
        deps.clock,
        deps.publishHistoryStore
      );

      res.status(202).json(snapshot);
    } catch (err) {
      // Everything above `startPublishRun` (auth check, snapshot read, body parsing) runs
      // synchronously-awaited in this one try; `startPublishRun` itself is deliberately NOT awaited
      // (see its own call site comment) so a failure inside the run it starts can never reach this
      // catch — only a failure BEFORE that point can, e.g. `deps.authorize` itself throwing.
      console.error("[publish-site] unexpected error triggering a publish", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/admin/v1/workspaces/:workspaceId/system/publish", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "system.publish",
        workspaceId: deps.workspaceId,
        entityType: "site-publish",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'system.publish' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "system.publish", reason: authResult.reason },
        });
        return;
      }

      res.status(200).json(getPublishRunSnapshot());
    } catch (err) {
      console.error("[publish-site] unexpected error polling publish status", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/admin/v1/workspaces/:workspaceId/system/publish/preview", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "system.read",
        workspaceId: deps.workspaceId,
        entityType: "site-publish",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'system.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "system.read", reason: authResult.reason },
        });
        return;
      }

      const parsed = parsePreviewQuery(req.query as Record<string, unknown>);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      // Same three reads `deployment_preview_static_publish`'s handler performs (this file's header)
      // — a pure shape check, a pure base-path derivation, and one `process.env` lookup. No export
      // runs, no filesystem or network I/O. `isConfigured()`, NOT `resolve()` (2026-08-15 split, see
      // `static-publish/types.ts`'s `PublishCredentialSource` header) — a preview must never resolve a
      // real credential just to read a boolean off it, which is what would silently start decrypting on
      // every preview call once a DB-backed source replaces this env-var one.
      const validationError = validateStaticPublishConfig(parsed.config);
      const basePath = validationError === null ? (computeBasePath(parsed.config) ?? null) : null;
      const credential = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target: parsed.config.target });

      res.status(200).json({
        target: parsed.config.target,
        valid: validationError === null,
        validationError,
        basePath,
        credentialsConfigured: credential.configured,
        credentialGuidance: credential.configured ? null : credential.reason,
        willInjectNojekyll: parsed.config.target === "github-pages",
      });
    } catch (err) {
      // `credentialSource.isConfigured` is the one awaited call here that can reach a real backing
      // store (DB-backed source, per this file's header) — a failure there used to escape this
      // handler entirely (no `try`/`catch` at all; found by an AST scan over every `app.<verb>()`
      // handler in `src/server/routes/**`).
      console.error("[publish-site] unexpected error building a publish preview", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
