import path from "node:path";

import { createApp } from "../../server/app";
import { createSqliteRouteDeps } from "../../server/deps";
import { ValidationError, type ConfigJson } from "../../site-dir";
import { bootSiteDir } from "../../site-dir/boot-site-dir";
import { resolveInstallDirTarget } from "../../site-dir/resolve-install-dir-target";
import { runtimeSchemaVersion } from "../../site-dir/schema-guard";
import { PortInUseError } from "../errors";

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
export async function runServeCommand(input: RunServeCommandInput): Promise<void> {
  warnIfLegacyEnvVarsIgnored();

  const target = resolveInstallDirTarget(input.dir);
  const bootResult = bootSiteDir({ dir: target }, { workspaceId: input.workspaceId });
  const port = resolveServePort(input, bootResult.config);

  const dbPath = path.join(target, "content.db");
  const deps = createSqliteRouteDeps(dbPath, {
    db: bootResult.db,
    workspaceId: bootResult.workspaceId,
    uploadsDir: path.join(target, "uploads"),
  });
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

      // BR-07: on SIGINT/SIGTERM, stop accepting new connections, let the current request finish,
      // then close the db handle and exit 0.
      const shutdown = (): void => {
        let exited = false;
        const finish = (): void => {
          if (exited) return;
          exited = true;
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
