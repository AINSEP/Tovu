import path from "node:path";

import { createApp } from "../../server/runtime/composition/app.js";
import { createSqliteRouteDeps } from "../../server/runtime/composition/deps.js";
import { ValidationError, type ConfigJson } from "../../platform/site-dir/index.js";
import { bootSiteDir } from "../../platform/site-dir/boot-site-dir.js";
import { resolveInstallDirTarget } from "../../platform/site-dir/resolve-install-dir-target.js";
import { runtimeSchemaVersion } from "../../platform/site-dir/schema-guard.js";
import { PortInUseError } from "../errors.js";
import { startAssistantDaemon, shutdownAssistantDaemon } from "../../server/inbound/assistant/index.js";
import { ensureAgentDaemonPortResolved } from "../../server/runtime/lifecycle/agent-daemon-port.js";
import { isAdminAssistantEnabled } from "../../server/runtime/composition/admin-assistant-enabled.js";
import { installUnhandledRejectionGuard } from "../../server/runtime/boot/process-error-guards.js";

/**
 * @file SPEC-003 C-002 (`CLI_SERVE`) — wires a commander action's parsed arguments to
 * `site-dir/boot-site-dir.ts`'s `bootSiteDir`, then `server/deps.ts` + `server/app.ts` +
 * `app.listen` (Wiring Map W-002).
 *
 * Purpose:
 * Owns the one HTTP-listen side effect this feature introduces, isolated from `site-dir` (which
 * has zero Express awareness) — port precedence (BR-02), the legacy-env-var-ignored warning
 * (BR-04/EC-08), the one boot-line log (api.spec.md §5), and graceful shutdown (BR-07).
 *
 * Architectural role:
 * `cli` layer. Never maps errors to exit codes itself (`cli/errors.ts`'s job) — lets `site-dir`
 * errors and `PortInUseError` propagate uncaught to `cli/main.ts`.
 *
 * Agent daemon (2026-08-28 dispatch): this command previously never started the agent daemon at
 * all — `src/index.ts` was the only boot path that did (`startAssistantDaemon`, at the bottom of
 * this file's `app.listen()` callback), so a Tovu instance launched via `tovu serve` (the packaged
 * CLI path, and what the Tovu-Runner desktop app spawns per project) served an admin UI whose
 * assistant could never respond. Fixed by mirroring `index.ts`'s own readiness-await-then-spawn
 * ordering exactly (see that file's own comment on why spawning too early shipped a real
 * duplicate-settings-row defect), plus resolving this instance's own daemon port BEFORE `createApp()`
 * (`ensureAgentDaemonPortResolved()` — see `runtime/lifecycle/agent-daemon-port.ts`'s header for why
 * an unconfigured instance now self-allocates a free port instead of every unconfigured Tovu on the
 * box converging on the same fixed 4319). Shutdown calls `shutdownAssistantDaemon()` directly rather
 * than letting `daemon-supervisor.ts` register its own signal handlers here — see
 * `startAssistantDaemon`'s `registerProcessSignalHandlers` option doc for why a second SIGINT/SIGTERM
 * listener calling `process.exit(0)` would race this command's own BR-07 graceful drain below.
 */

export interface RunServeCommandInput {
  dir: string;
  port?: string;
  workspaceId?: string;
}

const DEFAULT_PORT = 3000;

/** behavior.spec.md §4: `--port` must be an integer in 1..65535 — out-of-range/non-integer is VALIDATION, not a fall-through. */
function parsePort(raw: string | number): number {
  const str = String(raw).trim();
  if (!/^\d+$/.test(str)) {
    throw new ValidationError(`--port must be an integer between 1 and 65535 (got "${raw}")`);
  }
  const value = Number(str);
  if (value < 1 || value > 65535) {
    throw new ValidationError(`--port must be between 1 and 65535 (got ${value})`);
  }
  return value;
}

/** BR-02: `--port` flag, then `config.json.port`, then `PORT` env, then 3000 — first PRESENT value wins; a present-but-invalid value at any tier is VALIDATION, never a fall-through to the next tier. */
function resolveServePort(input: RunServeCommandInput, config: ConfigJson): number {
  if (input.port !== undefined) return parsePort(input.port);
  if (config.port !== null && config.port !== undefined) return parsePort(config.port);
  if (process.env.PORT !== undefined) return parsePort(process.env.PORT);
  return DEFAULT_PORT;
}

/** BR-04/EC-08: a `dir` argument overrides legacy env vars — logs a warning naming whichever is set, rather than silently ignoring it. */
function warnIfLegacyEnvVarsIgnored(): void {
  if (process.env.TOVU_CONTENT_DB !== undefined) {
    process.stderr.write("tovu: warning: TOVU_CONTENT_DB is ignored when a dir argument is given\n");
  }
  if (process.env.TOVU_DB !== undefined) {
    process.stderr.write("tovu: warning: TOVU_DB is ignored when a dir argument is given\n");
  }
}

/**
 * Run `tovu serve <dir> [--port]`: validate/guard/migrate/stamp/resolve the install dir
 * (`bootSiteDir`), wire the existing composition root's `overrides` branch, and bind a listener.
 *
 * @throws whatever `bootSiteDir` throws (`SiteDirInvalidError`, `SiteNewerThanRuntimeError`,
 *   `SiteCorruptError`), a `ValidationError` (bad `--port`), or a `PortInUseError` (`EADDRINUSE`)
 *   — `cli/main.ts` maps each to the correct exit code.
 * @complexity O(1) beyond `bootSiteDir`'s own bounded cost; the returned promise resolves once
 *   the listener is bound (the process then stays alive on the open socket, not on this promise).
 * @overallScore 100
 */
/** `TOVU_ADMIN_ASSISTANT=off` skips the daemon ONLY when external MCP is also unconfigured — the
 *  daemon owns external-MCP federation too, not just chat (see `admin-assistant-enabled.ts`). */
async function agentDaemonWanted(deps: { workspaceId: string; externalMcpServerRepo: { listByWorkspaceId: (id: string) => Promise<readonly unknown[]> } }): Promise<boolean> {
  if (isAdminAssistantEnabled()) return true;
  const configured = await deps.externalMcpServerRepo.listByWorkspaceId(deps.workspaceId);
  if (configured.length > 0) return true;
  console.log("[assistant] TOVU_ADMIN_ASSISTANT=off and no external MCP configured — not starting the agent daemon");
  return false;
}

export async function runServeCommand(input: RunServeCommandInput): Promise<void> {
  // Unhandled-rejection guard (2026-08-28 dispatch): `index.ts`'s `main()` installs this same guard
  // first, before any boot step (see `process-error-guards.ts`'s own header for the live crash that
  // motivated it) — this command never had it, and it is the one boot path Tovu-Runner actually
  // spawns. Verified live: `features/identity/wiring.ts`'s `ownerPrincipalId` is forked off
  // `seedResult` with no `.catch()` of its own anywhere; when `seedIdentity()` rejects (reproduced
  // with a real `UNIQUE constraint failed: roles.workspace_id, roles.name` from a corrupted
  // identity table), the `Promise.all([...]).catch(...)` below catches `identityReady`'s own
  // rejection fine, but that `ownerPrincipalId` fork is a SEPARATE promise with no handler at all —
  // an unhandled rejection that crashed the entire process a few seconds after boot. Installed as
  // the guard module's own header prescribes: fixed structurally, once, here, rather than chasing
  // down every individual forked promise that lacks a `.catch()` today or might tomorrow.
  installUnhandledRejectionGuard();

  warnIfLegacyEnvVarsIgnored();

  const target = resolveInstallDirTarget(input.dir);
  const bootResult = bootSiteDir({ dir: target }, { workspaceId: input.workspaceId });
  const port = resolveServePort(input, bootResult.config);

  const dbPath = path.join(target, "content.db");
  const deps = createSqliteRouteDeps(dbPath, {
    db: bootResult.db,
    workspaceId: bootResult.workspaceId,
    uploadsDir: path.join(target, "uploads"),
    // Same install-dir-relative reasoning as `uploadsDir` right above (CR-R01): the default themes
    // root is `process.cwd()`-relative, so without this a `<dir>` run would seed and serve a
    // `sites/tovu-com/themes` beside the operator's shell instead of the site it was given.
    themesDir: path.join(target, "themes"),
  });

  // Must resolve — and, when neither `JINI_AGENT_DAEMON_URL` nor `JINI_AGENT_DAEMON_PORT` is set,
  // allocate — this instance's daemon origin BEFORE `createApp()` wires the assistant proxy's
  // routes, so no inbound request can ever reach `getAgentDaemonUrl()` before it has something to
  // return. See this file's own header and `agent-daemon-port.ts`'s for the full contract.
  await ensureAgentDaemonPortResolved();
  const app = createApp(deps);

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port);

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new PortInUseError(`Port ${port} is already in use.`, port));
      } else {
        reject(err);
      }
    });

    server.once("listening", () => {
      const runtime = runtimeSchemaVersion();
      // api.spec.md §5: "one startup line including: dir, resolved port, schemaVersion, workspace id".
      // eslint-disable-next-line no-console
      console.log(`tovu serve: dir=${target} port=${port} schemaVersion=${runtime.index} workspaceId=${bootResult.workspaceId}`);
      resolve();

      // Same readiness-await-then-spawn ordering as `index.ts`'s own `app.listen()` callback, and
      // for the identical reason (see that file's comment on the call site this mirrors): spawning
      // before these settle raced this process's own first-boot identity/settings seeding and
      // shipped a real duplicate-`core.execution.mode`-row defect. `registerProcessSignalHandlers:
      // false` because this command already owns SIGINT/SIGTERM below (BR-07) — see
      // `startAssistantDaemon`'s own option doc for why a second listener here would race it.
      Promise.all([
        deps.identityReady,
        deps.settingsReady,
        deps.seoReady,
        deps.commentsReady,
        deps.commentsSettingsReady,
        deps.executionSettingsReady,
        deps.settingsUiTabsReady,
        deps.analyticsSettingsReady,
      ])
        .then(async () => {
          if (!(await agentDaemonWanted(deps))) return;
          startAssistantDaemon({ workspaceId: deps.workspaceId, siteDir: target }, { registerProcessSignalHandlers: false });
        })
        .catch((error: unknown) => {
          console.error("[cli/serve] a boot-readiness promise rejected — not starting the agent daemon", error);
        });

      // BR-07: on SIGINT/SIGTERM, stop accepting new connections, let the current request finish,
      // then close the db handle and exit 0.
      const shutdown = (): void => {
        let exited = false;
        const finish = (): void => {
          if (exited) return;
          exited = true;
          shutdownAssistantDaemon();
          bootResult.db.$client.close();
          process.exit(0);
        };
        server.close(finish);
        // Idle keep-alive sockets don't block in-flight requests, but a client-pooled connection
        // that never sends another request WOULD block `server.close()`'s callback indefinitely
        // otherwise — better-sqlite3 is synchronous, so any genuinely in-flight request completes
        // within milliseconds, not seconds; a short grace window is more than enough before this
        // safety net force-closes anything still lingering (BR-07 only promises the current
        // request finishes, not that an idle keep-alive socket outlives shutdown).
        server.closeIdleConnections?.();
        setTimeout(() => {
          server.closeAllConnections?.();
          finish();
        }, 500).unref();
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
  });
}
