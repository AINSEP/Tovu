import type { Express } from "express";

import {
  composePublishCredentialSource,
  getPublishRunSnapshot,
  missingRequiredFieldMessage,
  planStaticPublish,
  readStaticPublishConfig,
  startPublishRun,
  unknownTargetMessage,
  type StaticPublishConfig,
} from "#src/features/deployments/static-publish/index";
import type {
  DeployTargetCredentialSpec,
  DeployTargetRegistry,
  LoadedDeployTarget,
} from "#src/features/deployments/deploy-targets/types";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
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
 * Request body for the trigger: `{ target, projectName: string, credentialId?, ...configFields }` —
 * `target` is any id this workspace's deploy registry knows (`RouteDeps.loadDeployTargets`), and the
 * other fields read are exactly the ones that target's descriptor declares.
 *
 * `credentialId` (2026-09-20, terra review finding 1 — Critical) BINDS the publish to the saved
 * connection the operator chose, instead of letting the server pick whichever row is `is_default`
 * when the POST lands: selecting connection B and clicking Publish while B's promotion was still in
 * flight published the site to A's account. It is OPTIONAL, and deliberately so — the
 * `deployment_execute_static_publish` agent tool has no chosen connection, and a self-hosted install
 * whose credentials come from `GITHUB_TOKEN`/`VERCEL_TOKEN`/... has no connection ids at all. Those
 * callers keep the DEFAULT lookup, explicitly (`static-publish/credentials.ts`'s
 * `createDbPublishCredentialSource`); an id that is supplied is validated against this workspace and
 * this target by that same module, and refuses rather than falling back. Every other field is judged
 * by `static-publish/adapter.ts`'s `planStaticPublish` — the same call `publishStaticSite` makes —
 * so there is exactly one place a config is judged valid or not.
 *
 * A THIRD route, `GET .../system/publish/preview`, was added 2026-08-15 alongside the admin UI's
 * Static Site tab publish card. `deployment_preview_static_publish` (`publish-agent-tools.ts`)
 * already gives the ASSISTANT this exact read — target validity, the computed base path, and
 * whether a credential is configured (a boolean only, never the token) — but that tool is reached
 * over the agent-tool transport, not an HTTP route a browser session can call, and the admin UI has
 * no other way to answer "would this publish work?" before spending a real trigger+run on the
 * question. This route reuses the SAME `planStaticPublish` the tool calls, plus this file's own
 * `credentialSource`, so a preview here and a preview from the assistant can never disagree.
 * `system.read`-gated, matching every other GET in this directory (`export-site.ts`,
 * `deployment-overview.ts`) — it performs zero writes and zero network calls.
 *
 * A FOURTH, `GET .../system/publish-targets` (`system.read`), lists the registry's targets (id,
 * label, config field specs) so the admin UI can render the publish card from descriptors.
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
 * Parses and shape-validates the trigger request body's TARGET-INDEPENDENT fields. Never throws —
 * every malformed shape maps to a `{ok:false, error}` result this route turns into a `400`, matching
 * `export-site.ts`'s own `parseTriggerRequestBody` discipline. Which config fields `target` takes,
 * and whether their values are valid, is judged by the registry (`readStaticPublishConfig` +
 * `planStaticPublish`), so a caller only ever gets one canonical rejection for the same bad value.
 */
function parsePublishRequestBody(
  body: unknown
): { ok: true; raw: Record<string, unknown>; targetId: string; projectName: string; credentialId?: string } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.projectName !== "string" || raw.projectName.trim() === "") {
    return { ok: false, error: "'projectName' (non-empty string) is required" };
  }

  // Shape only, same discipline as every other field here — whether this id names a connection this
  // workspace actually owns, for this target, is judged exactly once, by the credential source
  // (`static-publish/credentials.ts`). Optional because the agent tool and env-var installs have no
  // connection id to send; see this file's header for the full backward-compatibility contract.
  if (raw.credentialId !== undefined && (typeof raw.credentialId !== "string" || raw.credentialId.trim() === "")) {
    return { ok: false, error: "'credentialId' must be a non-empty string when present" };
  }

  if (typeof raw.target !== "string" || raw.target.trim() === "") {
    return { ok: false, error: "'target' (non-empty string) is required" };
  }
  return {
    ok: true,
    raw,
    targetId: raw.target,
    projectName: raw.projectName,
    ...(typeof raw.credentialId === "string" ? { credentialId: raw.credentialId } : {}),
  };
}

/**
 * Resolves `targetId` in this workspace's registry and reads its descriptor-declared config fields
 * from `raw`. Registry refusals (a module that did not load) are logged, never returned.
 * @returns The target and config, or a refusal naming the unknown target / the non-string field.
 * @complexity One registry load plus O(f) declared fields.
 */
async function readTargetConfig(
  deps: AdminPublishSiteDeps,
  targetId: string,
  raw: Record<string, unknown>,
  blankAsAbsent: boolean
): Promise<{ ok: true; registry: DeployTargetRegistry; target: LoadedDeployTarget; config: StaticPublishConfig } | { ok: false; error: string }> {
  const registry = await deps.loadDeployTargets(deps.workspaceId);
  for (const refusal of registry.refusals) console.warn(`[publish-site] ${refusal}`);
  const target = registry.get(targetId);
  if (target === undefined) return { ok: false, error: unknownTargetMessage(registry, targetId) };
  const read = readStaticPublishConfig(target, raw, { blankAsAbsent });
  if (!read.ok) return { ok: false, error: read.message };
  return { ok: true, registry, target, config: read.config };
}

/** A target's saved-credential form, as the admin renders it: the field specs (secret fields flagged,
 *  never a value), the form's help and token page, and which field is the token. @complexity O(1). */
function publicCredentialSpec(spec: DeployTargetCredentialSpec): {
  help?: string;
  tokenPageUrl?: string;
  tokenField: string;
  fields: DeployTargetCredentialSpec["fields"];
} {
  return {
    ...(spec.help !== undefined ? { help: spec.help } : {}),
    ...(spec.tokenPageUrl !== undefined ? { tokenPageUrl: spec.tokenPageUrl } : {}),
    tokenField: spec.tokenField,
    fields: spec.fields,
  };
}

export function registerAdminPublishSiteRoutes(app: Express, deps: AdminPublishSiteDeps): void {
  // Built once per `registerAdminPublishSiteRoutes` call (this route file's own registration is
  // itself a once-per-process composition step), bound to `deps.workspaceId` — see
  // `static-publish/credentials.ts`'s `composePublishCredentialSource` header for the DB-first,
  // env-fallback-only-when-self-hosted composition this now performs.
  const credentialSource = composePublishCredentialSource({
    workspaceId: deps.workspaceId,
    executionMode: deps.publishExecutionMode,
    dbDeps: { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, loadDeployTargets: deps.loadDeployTargets },
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/system/publish", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "system.publish",
        workspaceId: deps.workspaceId,
        entityType: "site-publish",
      });
      if (!authorized) return;

      const parsed = parsePublishRequestBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      // Fails fast, before flipping the shared run slot to "running" or touching the
      // filesystem/network at all, on a config `publishStaticSite` would reject anyway — the same
      // `planStaticPublish` verdict `publishStaticSite` reaches internally — so a caller who only sends
      // a malformed config never sees a "running" snapshot at all.
      const read = await readTargetConfig(deps, parsed.targetId, parsed.raw, false);
      if (!read.ok) {
        res.status(400).json({ error: read.error });
        return;
      }
      const plan = planStaticPublish(read.registry, read.config);
      if (!plan.ok) {
        res.status(400).json({ error: plan.message });
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

      // Deliberately not awaited — see this file's header for why the response returns before the
      // publish finishes. `startPublishRun` itself keeps the shared slot in sync as the publish
      // settles, so a poller can never observe a stale "running" snapshot after the promise has
      // actually settled.
      const snapshot = startPublishRun(
        { credentialSource, loadDeployTargets: deps.loadDeployTargets },
        {
          workspaceId: deps.workspaceId,
          publishOutputRootDir: deps.publishOutputRootDir,
          idGen: deps.idGen,
          exportSiteBound: deps.exportSiteBound,
          config: read.config,
          projectName: parsed.projectName,
          // The connection the operator actually chose in the Static Site tab. Never defaulted here:
          // an absent id means "this caller has no chosen connection", which the credential source
          // answers with its own default lookup — see `parsePublishRequestBody` above.
          ...(parsed.credentialId !== undefined ? { credentialId: parsed.credentialId } : {}),
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
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "system.publish",
        workspaceId: deps.workspaceId,
        entityType: "site-publish",
      });
      if (!authorized) return;

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
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "system.read",
        workspaceId: deps.workspaceId,
        entityType: "site-publish",
      });
      if (!authorized) return;

      const query = req.query as Record<string, unknown>;
      if (typeof query.target !== "string" || query.target.trim() === "") {
        res.status(400).json({ error: "'target' query param (non-empty string) is required" });
        return;
      }
      const read = await readTargetConfig(deps, query.target, query, true);
      if (!read.ok) {
        res.status(400).json({ error: read.error });
        return;
      }
      // A required field that is absent is a malformed request (400); a present-but-invalid value is
      // an answer (200, `valid:false`) — the distinction the admin card renders.
      const missing = missingRequiredFieldMessage(read.target, read.config);
      if (missing !== null) {
        res.status(400).json({ error: missing });
        return;
      }

      // Same reads `deployment_preview_static_publish`'s handler performs (this file's header) — the
      // registry's plan (config check + base path) and one credential lookup. No export runs, no
      // network I/O. `isConfigured()`, NOT `resolve()` (2026-08-15 split, see
      // `static-publish/types.ts`'s `PublishCredentialSource` header) — a preview must never resolve a
      // real credential just to read a boolean off it.
      const plan = planStaticPublish(read.registry, read.config);
      const credential = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target: read.config.target });

      res.status(200).json({
        target: read.config.target,
        valid: plan.ok,
        validationError: plan.ok ? null : plan.message,
        basePath: plan.ok ? (plan.basePath ?? null) : null,
        credentialsConfigured: credential.configured,
        credentialGuidance: credential.configured ? null : credential.reason,
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

  // The registry's targets, for the admin publish card to render from descriptors (deploy plan T7).
  // Ids, labels, config field specs and the saved-credential form's field specs only: a module path,
  // a vendor id or a refusal reason stays server-side.
  app.get("/api/admin/v1/workspaces/:workspaceId/system/publish-targets", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "system.read",
        workspaceId: deps.workspaceId,
        entityType: "site-publish",
      });
      if (!authorized) return;

      const registry = await deps.loadDeployTargets(deps.workspaceId);
      for (const refusal of registry.refusals) console.warn(`[publish-site] ${refusal}`);
      res.status(200).json({
        targets: registry.list().map(({ descriptor }) => ({
          id: descriptor.id,
          label: descriptor.label,
          configFields: descriptor.configFields,
          ...(descriptor.projectName !== undefined ? { projectName: descriptor.projectName } : {}),
          ...(descriptor.credential !== undefined ? { credential: publicCredentialSpec(descriptor.credential) } : {}),
        })),
      });
    } catch (err) {
      console.error("[publish-site] unexpected error listing publish targets", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
