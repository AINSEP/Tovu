import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Express } from "express";

import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { DEFAULT_OWNER_PASSWORD } from "#src/features/identity/wiring";
import { defaultContentDbPath, mediaUploadsDir } from "#src/server/runtime/composition/deps";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { isAssistantDaemonKnownFailed } from "#src/server/runtime/lifecycle/readiness-state";
import { inspectRootKeyMaterial, type RootKeyStatus } from "#src/features/webhooks/keyring.env";
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
 */
export type AdminDeploymentOverviewDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "identityReady" | "ownerPrincipalId" | "userRepo" | "passwordHasher"
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
  /**
   * Which publish CLIs are on this process's PATH. The assistant is a spawned coding-agent CLI, so
   * when these are present it can drive them directly — which needs no provider token stored here,
   * because the CLI already holds its own auth. Their absence is not an error: the token-based
   * adapter path exists for exactly that case.
   */
  deployClis: DeployCliStatus[];
}

/** One publish CLI's availability on PATH. */
export interface DeployCliStatus {
  name: string;
  installed: boolean;
}

/** The publish CLIs worth reporting on — display order. */
const DEPLOY_CLI_NAMES = ["gh", "vercel"] as const;

/** True if any of `candidates` exists directly inside `dir`. Split out of `isOnPath` so its
 *  try/catch-per-candidate loop isn't nested inside the outer per-PATH-entry loop.
 *  @complexity O(C) in the candidate count — bounded (1 or 3), not request data. */
function candidateExistsInDir(dir: string, candidates: readonly string[]): boolean {
  for (const candidate of candidates) {
    try {
      if (existsSync(join(dir, candidate))) return true;
    } catch {
      // An unreadable or malformed PATH entry is not an answer about the binary — keep looking.
    }
  }
  return false;
}

/**
 * Whether `binary` resolves on this process's PATH.
 *
 * Deliberately a filesystem walk rather than spawning `which`/`command -v`: this runs on every
 * Overview render, and spawning a child process per request to answer a question `existsSync` can
 * answer is both slower and a process-spawn surface this route does not otherwise need. The names
 * are fixed module constants, never caller-supplied, so nothing here interpolates untrusted input
 * into a path.
 *
 * Not cached: an operator who installs `gh` while the admin is open should see it on the next
 * render rather than after a restart, and the cost is a handful of `stat` calls.
 *
 * @complexity O(P) in the number of PATH entries — bounded by the environment, not by request data.
 */
function isOnPath(binary: string): boolean {
  const raw = process.env.PATH;
  if (raw === undefined || raw === "") return false;
  const isWindows = process.platform === "win32";
  // On Windows a bare name is not executable; PATHEXT-style suffixes are what actually resolve.
  const candidates = isWindows ? [`${binary}.exe`, `${binary}.cmd`, `${binary}.bat`] : [binary];
  return raw.split(isWindows ? ";" : ":").some((dir) => dir !== "" && candidateExistsInDir(dir, candidates));
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
    deployClis: DEPLOY_CLI_NAMES.map((name) => ({ name, installed: isOnPath(name) })),
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
  return deps.passwordHasher.verify(owner.passwordHash, DEFAULT_OWNER_PASSWORD);
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

      res.status(200).json(buildDeploymentOverviewSnapshot({ defaultOwnerPasswordUnsafe: await isOwnerOnDefaultPassword(deps) }));
    } catch (err) {
      console.error("[system/deployment-overview] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
