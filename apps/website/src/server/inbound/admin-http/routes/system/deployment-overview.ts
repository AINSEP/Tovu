import type { Express } from "express";

import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { DEFAULT_OWNER_PASSWORD } from "#src/features/identity/wiring";
import { defaultContentDbPath, mediaUploadsDir } from "#src/server/runtime/composition/deps";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { isAssistantDaemonKnownFailed } from "#src/server/runtime/lifecycle/readiness-state";
import { inspectRootKeyMaterial, type RootKeyStatus } from "#src/features/webhooks/keyring.env";
import { resolveSiteTokenSources } from "./site-token.js";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Deployment panel → Overview tab backend.
 *
 * Registers `GET /api/admin/v1/workspaces/:workspaceId/system/deployment-overview` — a read-only
 * snapshot of how THIS instance is currently running, for the self-hosted-developer audience the
 * Deployment panel now targets. Every field here is a direct read of a value this process already
 * computed at boot or can compute for free; nothing is measured, inferred, or fabricated.
 *
 * Mirrors `module-status.ts`'s shape exactly (workspace-id 404 check → `system.read` authorize →
 * 403-on-denial), reusing the same permission — this is one more system-status read, not a new kind
 * of capability. `entityType: "deployment-status"` follows `recent-hits.ts`'s precedent of a
 * route-specific descriptive string rather than a shared literal across unrelated resources.
 *
 * ## Site-key plan §A3b — site-aware root-key row
 *
 * The `TOVU_INTEGRATIONS_ROOT_KEY` row resolves THIS site's own ordered source list
 * ({@link resolveSiteTokenSources}, `site-token.ts`) instead of `inspectRootKeyMaterial()`'s
 * module-level env-then-legacy-default precedence — the same seam the Site Token tab's own
 * `GET`/`reveal`/`generate` verbs already use, so a site with a resolvable per-site key file
 * (`~/.tovu/site-keys/<siteKeyId>.hex`) reports it as active here too, not only on that tab. A site
 * with no readable `.site-meta.json` (or production, which has no per-site file at all) falls back
 * to exactly today's behavior.
 */
export type AdminDeploymentOverviewDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "identityReady" | "ownerPrincipalId" | "userRepo" | "passwordHasher" | "siteBinding"
>;

/** One required-for-production env var's presence, never its value. */
export interface DeploymentEnvVarStatus {
  name: string;
  set: boolean;
  /** Root key row only: where the keyring's material came from. `set` there means "usable root key",
   *  so a valid generated key file counts, and malformed env/file material does not. */
  source?: RootKeyStatus["source"];
  /** Root key row only, present iff material was found but the keyring would reject it. */
  invalid?: true;
}

export interface DeploymentOverviewSnapshot {
  /** `resolveRuntimeMode()`'s own two-value type — deliberately not "development": Tovu's actual
   *  runtime-mode signal is `"production" | "local"` (`core/runtime-mode.ts`), and echoing that
   *  exact vocabulary here is more honest than translating it to a pair the UI never really has. */
  mode: "production" | "local";
  /**
   * The boot-time production readiness gate (`production-readiness-gate.ts`) is "entirely inert
   * outside production mode" by its own doc comment, and in production mode a failing gate exits
   * the process before it ever starts listening (`index.ts`'s `runBootGateOrExit`) — so a request
   * reaching this route in production mode is itself proof the gate passed. `applicable: false`
   * in local mode is the honest "this check does not run here" state, not a hidden pass.
   */
  productionReadinessGate: { applicable: boolean; passed: boolean };
  /**
   * Whether the seeded owner account is still on the publicly-documented default password — read
   * from the owner's STORED hash ({@link isOwnerOnDefaultPassword}), not from `TOVU_ADMIN_PASSWORD`.
   * Computed unconditionally (not gated on production mode) since it is a real, useful warning in
   * local mode too.
   */
  defaultOwnerPasswordUnsafe: boolean;
  /**
   * Whether the locally-spawned agent daemon is KNOWN to have failed (`readiness-state.ts`). This
   * is a negative signal only — "not known-failed" can also mean "never spawned" (e.g. pure BYOK
   * setups never start it), so the UI must not read `!daemonKnownFailed` as "confirmed alive".
   */
  daemonKnownFailed: boolean;
  /** `defaultContentDbPath()` — the same path `deps.ts` opens SQLite from. */
  dbPath: string;
  /** `mediaUploadsDir()` — the same path the blob store writes under. */
  uploadsDir: string;
  /** Presence only, per required env var — never a value. */
  envVars: DeploymentEnvVarStatus[];
}

/** The four env vars the brief calls out — order here is display order. */
const REQUIRED_ENV_VAR_NAMES = [
  "TOVU_ADMIN_PASSWORD",
  "TOVU_ADMIN_USER",
  "TOVU_INTEGRATIONS_ROOT_KEY",
  "JINI_AGENT_DAEMON_PORT",
] as const;

/** The root key row, from what `EnvOrFileKeyring` would actually resolve — the env var OR a generated
 *  key file, validated — rather than the env var's bare presence. @complexity O(1). */
function rootKeyEnvVarStatus(rootKey: RootKeyStatus): DeploymentEnvVarStatus {
  return {
    name: "TOVU_INTEGRATIONS_ROOT_KEY",
    set: rootKey.active,
    source: rootKey.source,
    ...(rootKey.invalid ? { invalid: true as const } : {}),
  };
}

function envVarStatus(name: (typeof REQUIRED_ENV_VAR_NAMES)[number], rootKey: RootKeyStatus): DeploymentEnvVarStatus {
  return name === "TOVU_INTEGRATIONS_ROOT_KEY" ? rootKeyEnvVarStatus(rootKey) : { name, set: Boolean(process.env[name]) };
}

/**
 * Builds the snapshot from live process state. Exported separately from the route registrar so a
 * test can call it directly without spinning up Express.
 *
 * @param input.defaultOwnerPasswordUnsafe the one field that needs the database, resolved by the
 *   caller ({@link isOwnerOnDefaultPassword}) so this stays synchronous.
 * @param input.rootKey test seam; defaults to a live {@link inspectRootKeyMaterial} read.
 * @complexity O(1) — fixed-size env var list, no iteration over caller-controlled data.
 */
export function buildDeploymentOverviewSnapshot(input: {
  defaultOwnerPasswordUnsafe: boolean;
  rootKey?: RootKeyStatus;
}): DeploymentOverviewSnapshot {
  const mode = resolveRuntimeMode();
  const rootKey = input.rootKey ?? inspectRootKeyMaterial();
  return {
    mode,
    productionReadinessGate: { applicable: mode === "production", passed: mode === "production" },
    defaultOwnerPasswordUnsafe: input.defaultOwnerPasswordUnsafe,
    daemonKnownFailed: isAssistantDaemonKnownFailed(),
    dbPath: defaultContentDbPath(),
    uploadsDir: mediaUploadsDir(),
    envVars: REQUIRED_ENV_VAR_NAMES.map((name) => envVarStatus(name, rootKey)),
  };
}

/**
 * Whether the seeded owner's stored password still verifies against `DEFAULT_OWNER_PASSWORD`.
 *
 * Read from the database because `TOVU_ADMIN_PASSWORD` only says what a FIRST boot would seed:
 * seeding never rotates an existing owner, so the env var and the stored credential drift apart the
 * moment either changes. Both directions were wrong in practice — the desktop app now passes a
 * random `TOVU_ADMIN_PASSWORD` into every spawn (LAN-bind plan, 2026-09-23), so a site it created
 * before that fix, still on the default, read as "changed"; and an owner who changed their password
 * in the admin UI with the env var unset read as "still the default" forever.
 *
 * @returns `false` when there is no owner user row to check (nothing can sign in with the default).
 * @complexity O(1) — one user lookup and one argon2id verify (tens of ms, by design of the hash).
 */
async function isOwnerOnDefaultPassword(deps: AdminDeploymentOverviewDeps): Promise<boolean> {
  await deps.identityReady;
  const principalId = await deps.ownerPrincipalId;
  const owner = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId });
  if (!owner) return false;
  return deps.passwordHasher.verify({ hash: owner.passwordHash, password: DEFAULT_OWNER_PASSWORD });
}

export function registerAdminDeploymentOverviewRoute(app: Express, deps: AdminDeploymentOverviewDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/deployment-overview", async (req, res) => {
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
        entityType: "deployment-status",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'system.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "system.read", reason: authResult.reason },
        });
        return;
      }

      // Site-key plan §A3b: resolve THIS site's own source order (the same
      // `resolveSiteTokenSources` seam `site-token.ts`'s GET/reveal/generate verbs use) rather than
      // `buildDeploymentOverviewSnapshot`'s bare-default `inspectRootKeyMaterial()`, so a site with a
      // resolvable per-site key file reports it here too, not just on the Site Token tab.
      const { sources } = resolveSiteTokenSources(deps);
      res.status(200).json(
        buildDeploymentOverviewSnapshot({
          defaultOwnerPasswordUnsafe: await isOwnerOnDefaultPassword(deps),
          rootKey: inspectRootKeyMaterial({ sources }),
        })
      );
    } catch (err) {
      console.error("[system/deployment-overview] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
