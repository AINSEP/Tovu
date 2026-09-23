/**
 * @file How the desktop shell's MCP server gets into a site's External MCP roster: a generated
 * launcher script, and one idempotent PUT re-asserted every time a site's server boots.
 *
 * ## Why a launcher script exists at all
 *
 * Two independent constraints in `apps/website` force it, and neither is negotiable from here:
 *
 * 1. **The daemon REPLACES an MCP child's environment.** `mcp-federation/adapter.stdio.ts:251-255,339`
 *    spawns with `{...inheritedEnv(), ...spec.env}` where `inheritedEnv()` is exactly `PATH`, `HOME`
 *    and `TMPDIR`. So `ELECTRON_RUN_AS_NODE=1` cannot reach the child — and this shell's only Node is
 *    Electron's own binary (`tovu-server.ts`'s `buildCliSpawnPlan` makes the same call for `tovu
 *    serve`, deliberately, so the app does not depend on a system Node install). Naming Electron as
 *    the `command` without that variable launches a second GUI app instead of a script.
 *    Putting the variable in the stored row's `env` block instead routes it through
 *    `external-mcp-store.ts:1380-1391`'s credential sealing, which fails the whole save with
 *    `SECRET_STORE_UNCONFIGURED` on any site that has no keyring root key.
 *
 * 2. **`args` splits on whitespace.** `external-mcp-store.ts`'s `parseArgs` splits on whitespace
 *    and honours exactly one quoting form (a token that starts and ends with `"`), and the value that
 *    must reach the bridge is `~/Library/Application Support/tovu-desktop` — unquoted, two broken
 *    arguments. On POSIX {@link buildSitesMcpRegistration} sends an EMPTY `args` and the userData
 *    path travels inside the launcher, properly quoted, instead; on win32, where no launcher can be
 *    exec'd, it sends both paths in that `"..."` form.
 *
 * So the launcher is not a convenience wrapper; it is the only place both facts can be satisfied at
 * once. It is generated, never hand-written, and rewritten on every launch so it cannot drift from
 * the Electron binary or the bridge path it names.
 *
 * ## Why the row is re-asserted rather than created once
 *
 * `external-mcp-repo.sqlite.ts:137-139` deletes a row outright, with no `deleted_at` tombstone — an
 * operator who removes this connection in Settings has removed it unrecoverably. Re-PUTting the same
 * server id on every site-open makes that self-healing: the PUT is idempotent by id
 * (`admin-http/routes/external-mcp/put.ts`'s own doc), so the ordinary case writes the identical row
 * back and the accident-recovery case rebuilds it. The launcher is regenerated on the same schedule
 * and for a related reason — it embeds an absolute path into the `.app` bundle, which goes stale the
 * moment the operator moves the app or an update replaces it.
 *
 * **What the re-assert deliberately does NOT do is override the operator.** It repairs facts that go
 * stale on their own — the command path, the tool allowlists — and carries the one field they
 * control, `enabled`, forward exactly as they left it. An earlier draft sent `enabled: true` every
 * time, which meant disabling the connection in Settings lasted until the next launch and then
 * silently undid itself. That is a setting reversed with nothing telling them, which is worse than
 * the problem the re-assert solves. `readSitesMcpEnabled` is what makes the distinction possible,
 * and it declines to write at all when it cannot tell.
 *
 * No `electron` import: the HTTP call takes `net` and `session` as injected dependencies, exactly as
 * `desktop-auth.ts` does, so all of it is testable under plain `node --test`.
 */
import fs from "node:fs";
import path from "node:path";

import { SITES_MCP_TOOLS } from "./sites-mcp-tools.ts";

/** The connection id, and therefore the prefix of every tool the assistant sees:
 *  `mcp__tovu-desktop__<name>` (`trust.ts` R1). Must match `trust.ts`'s `CONNECTION_ID_PATTERN`
 *  (`/^[a-z0-9][a-z0-9-]{0,39}$/`) — lowercase, no underscore, since an underscore here would blur
 *  that id's own `__` separator. */
const SITES_MCP_SERVER_ID = "tovu-desktop";

/** What the operator sees in Settings → External MCP, and what `trust.ts` R6 prefixes onto every
 *  tool description the model reads. */
const SITES_MCP_LABEL = "Tovu Desktop";

/** The generated launcher's filename inside `userData`. Named for what it is, since an operator
 *  who finds it has to be able to tell it is ours and disposable. */
const SITES_MCP_LAUNCHER_NAME = "tovu-desktop-mcp-launcher.sh";

/** {@link buildSitesMcpLauncherScript}'s three interpolated values. */
interface LauncherScriptInput {
  electronPath: string;
  bridgePath: string;
  userDataDir: string;
}

/** {@link writeSitesMcpLauncher}'s input: the same three values, under the directory they are
 *  written into. */
interface WriteLauncherInput {
  userDataDir: string;
  electronPath: string;
  bridgePath: string;
  /** Test seam: injects the OS platform this branches on. Defaults to the real `process.platform`;
   *  production never passes this. See {@link writeSitesMcpLauncher}'s own doc for what win32 does
   *  instead of writing a script. */
  platform?: NodeJS.Platform;
}

/** {@link buildSitesMcpRegistration}'s input. */
interface BuildRegistrationInput {
  launcherPath: string;
  enabled?: boolean;
  /** Test seam: injects the OS platform this branches on. Defaults to the real `process.platform`;
   *  production never passes this explicitly — {@link registerSitesMcpServer} forwards whatever its
   *  own caller gave it, which is nothing on POSIX. */
  platform?: NodeJS.Platform;
  /** win32 only: the bridge script's absolute path. Required when `platform` is `"win32"` (see this
   *  function's own doc for why); ignored on every other platform. */
  bridgePath?: string;
  /** win32 only: the userData directory. Required when `platform` is `"win32"`; ignored elsewhere. */
  userDataDir?: string;
}

/** The PUT body {@link buildSitesMcpRegistration} returns — the wire shape `put.ts` reads. */
interface SitesMcpRegistrationBody {
  label: string;
  transport: "stdio";
  authMode: "none";
  enabled: boolean;
  command: string;
  args: string;
  allowedToolNames: string;
  writeAllowedToolNames: string;
  env: string;
}

/** The slice of Electron's `IncomingMessage` this file reads. Unlike `desktop-auth.ts`'s own
 *  `AuthResponse`, the `data` listener here is actually read for the response body. */
interface AdminHttpResponse {
  statusCode: number;
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  on(event: "end", listener: () => void): unknown;
}

/** The slice of Electron's `ClientRequest` this file writes and reads. */
interface AdminHttpRequest {
  setHeader(name: string, value: string): void;
  write(chunk: string): void;
  on(event: "response", listener: (response: AdminHttpResponse) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  end(): void;
}

/** What `net.request` is given here, a subset of Electron's `ClientRequestConstructorOptions`. The
 *  session is only handed through to the request, so its type is whatever the caller's is — same
 *  convention as `desktop-auth.ts`'s `AuthRequestOptions`. */
interface AdminHttpRequestOptions<TSession> {
  method: "GET" | "PUT";
  url: string;
  session: TSession;
  useSessionCookies: boolean;
}

/** The slice of Electron's `net` module used here. */
interface AdminHttpNet<TSession> {
  request(options: AdminHttpRequestOptions<TSession>): AdminHttpRequest;
}

/** {@link requestSiteAdminJson}'s result: a plain outcome, never a rejection — see its own doc.
 *  `body` is `any` rather than `unknown`: it is one caller's admin-list JSON and another caller's
 *  PUT acknowledgement, and each reads its own shape back out ({@link readSitesMcpEnabled} reads
 *  `.servers`) rather than sharing one type here. */
type AdminHttpResult =
  | { ok: true; status: number; body: any }
  | { ok: false; status?: number; reason: string };

/** The dependency bag {@link readSitesMcpEnabled} and {@link registerSitesMcpServer} share. */
interface RegistrationDeps<TSession> {
  net: AdminHttpNet<TSession>;
  session: TSession;
  adminUrl: string;
  workspaceId: string;
}

/** {@link readSitesMcpEnabled}'s three possible answers — see its own doc for why the third exists. */
type SitesMcpEnabledState =
  | { state: "present"; enabled: boolean }
  | { state: "absent" }
  | { state: "unknown"; reason: string };

/**
 * Refuse to build a script around a value that could escape its own quoting.
 *
 * Every interpolated value here originates in this shell's own code — `process.execPath`, a path
 * derived from `import.meta.url`, and the userData directory — so none of them is attacker-supplied
 * today. This check is here so that stays true by CONSTRUCTION rather than by a reader tracing
 * three call sites: single quotes are the only character that can terminate a `'...'` literal in
 * `/bin/sh`, and a newline could append a whole command. A value carrying either is a bug, and
 * failing loudly is the only safe response — a launcher is an exec boundary.
 *
 * @throws {Error} naming the field, never echoing the whole value into a log.
 * @complexity O(n) in the value's length.
 */
function assertShellQuotable(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`projects-mcp-registration: ${field} must be a non-empty string.`);
  }
  if (value.includes("'") || /[\r\n]/.test(value)) {
    throw new Error(`projects-mcp-registration: ${field} contains a quote or newline and cannot be used in the launcher script.`);
  }
  return value;
}

/**
 * The launcher's exact contents.
 *
 * Deliberately the smallest script that can work, and deliberately built by one function so the
 * whole exec path is reviewable in one place:
 *
 * ```sh
 * #!/bin/sh
 * # Generated by Tovu Desktop — rewritten on every launch. Do not edit.
 * ELECTRON_RUN_AS_NODE=1
 * export ELECTRON_RUN_AS_NODE
 * exec '<electron>' '<bridge>' --user-data-dir '<userDataDir>' "$@"
 * ```
 *
 * `export` on its own line rather than the shorter `VAR=1 exec cmd` prefix: for a POSIX *special*
 * built-in like `exec`, an assignment prefix affects the current shell's variables and is not
 * required to be exported into the replacing image, so the short form is not portably guaranteed to
 * do the one thing this script exists for.
 *
 * `"$@"` forwards anything the daemon appends, which is nothing today — it costs one token and means
 * a future argument does not need this file regenerated in a different shape.
 *
 * @complexity O(1).
 */
function buildSitesMcpLauncherScript({ electronPath, bridgePath, userDataDir }: LauncherScriptInput): string {
  const electron = assertShellQuotable(electronPath, "electronPath");
  const bridge = assertShellQuotable(bridgePath, "bridgePath");
  const userData = assertShellQuotable(userDataDir, "userDataDir");
  return [
    "#!/bin/sh",
    "# Generated by Tovu Desktop — rewritten on every launch. Do not edit.",
    "ELECTRON_RUN_AS_NODE=1",
    "export ELECTRON_RUN_AS_NODE",
    `exec '${electron}' '${bridge}' --user-data-dir '${userData}' "$@"`,
    "",
  ].join("\n");
}

/**
 * Write the launcher into `userDataDir` with owner-only permissions, and return its path.
 *
 * `0o700` on both the write and an explicit `chmodSync`: `writeFileSync`'s `mode` is masked by the
 * process umask, so it is a request rather than a guarantee, and this file is executed — a
 * group-writable launcher would be a local privilege-escalation seam into the Tovu daemon. The
 * `chmod` is what makes the permission a fact.
 *
 * Rewritten unconditionally rather than only when absent. The two paths it interpolates change when
 * the app is upgraded, moved, or switched between a source checkout and a packaged bundle, and a
 * stale launcher pointing at a deleted Electron binary fails at connect time with an error that
 * names neither cause.
 *
 * **win32 writes nothing.** A `.cmd`/`.bat` file cannot be executed by `adapter.stdio.ts`'s
 * `spawn(spec.command, [...spec.args], {env, stdio})` — that call never sets `shell: true`, and
 * Node's own hardening (CVE-2024-27980) refuses to exec a batch file without one. There is no
 * script format this daemon's spawn call can run on win32, so none is written; the returned value
 * is `electronPath` itself, and {@link buildSitesMcpRegistration} registers it directly with the
 * bridge and userData path carried in `args`/`env` instead of embedded in a script.
 *
 * @param platform test seam; see {@link WriteLauncherInput}.
 * @returns the launcher's absolute path on POSIX, for {@link buildSitesMcpRegistration}'s `command`;
 *   `electronPath` unchanged on win32, for the same field's direct-electron branch.
 * @complexity O(1).
 */
function writeSitesMcpLauncher({ userDataDir, electronPath, bridgePath, platform = process.platform }: WriteLauncherInput): string {
  if (platform === "win32") return electronPath;
  const script = buildSitesMcpLauncherScript({ electronPath, bridgePath, userDataDir });
  const launcherPath = path.join(userDataDir, SITES_MCP_LAUNCHER_NAME);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(launcherPath, script, { mode: 0o700 });
  fs.chmodSync(launcherPath, 0o700);
  return launcherPath;
}

/** Wraps one win32 path for {@link buildSitesMcpRegistration}'s `args`, in the only quoting form
 *  `external-mcp-store.ts`'s `parseArgs` reads: `"..."` with no escapes.
 *  @throws {Error} when the path itself contains a `"`, which that form cannot carry.
 *  @complexity O(n) in the path length. */
function quoteArg(value: string): string {
  if (value.includes('"')) {
    throw new Error(`sites-mcp-registration: a win32 path cannot contain a double quote: ${value}`);
  }
  return `"${value}"`;
}

/**
 * The PUT body that registers this shell's tools with one site.
 *
 * Pure, so the trust-critical part of registration — which tools are allowlisted, which are
 * write-authorized, and that `destructiveHint` is nowhere — is assertable without a server, a
 * session or a site.
 *
 * The two allowlists are DERIVED from `sites-mcp-tools.ts`'s own table rather than restated:
 *
 * - `allowedToolNames` is every tool. `trust.ts` R2 is default-deny, so a tool absent here is
 *   discovered and then refused; deriving the list means adding a tool to the table cannot
 *   accidentally ship it unreachable.
 * - `writeAllowedToolNames` is exactly the tools declaring `readOnlyHint: false`. `trust.ts:326`
 *   refuses such a tool unless it is in BOTH lists, and `external-mcp-store.ts:1701`'s
 *   `assertWriteAllowlistSubset` rejects the save outright if this list is not a subset of the
 *   first — so deriving both from one source is what keeps the two rules satisfied at once.
 *
 * `args` is empty ON PURPOSE and must stay empty ON POSIX: see this file's header, constraint 2.
 *
 * **win32 is the one exception**, because {@link writeSitesMcpLauncher} writes no script there —
 * `launcherPath` IS `electronPath` on that platform, so this function commands it directly and
 * carries `bridgePath` plus `--user-data-dir <userDataDir>` in `args`, and `ELECTRON_RUN_AS_NODE=1`
 * in `env` (`NAME=VALUE`, the format `external-mcp-store.ts`'s `parseEnvBlock` reads) — the same two
 * facts the POSIX launcher script states in its own `exec` line and `export`. Each path is wrapped
 * in double quotes, the one quoting rule `external-mcp-store.ts`'s `parseArgs` honours, so a
 * username or install directory with a space in it (`C:\\Users\\John Smith\\...`) still arrives as
 * a single argument — constraint 2's POSIX workaround (hide the path in a script) has no win32
 * equivalent, so the store reads quotes instead.
 *
 * @throws {Error} on win32 without both `bridgePath` and `userDataDir` — there is nothing to put in
 *   `args` otherwise, and a half-registered connection is worse than none — or when either contains a
 *   `"`, which `parseArgs` has no way to carry inside a quoted argument (and no Windows path can hold).
 * @complexity O(n) in the tool count.
 */
function buildSitesMcpRegistration({
  launcherPath,
  enabled = true,
  platform = process.platform,
  bridgePath,
  userDataDir,
}: BuildRegistrationInput): SitesMcpRegistrationBody {
  const writeTools = SITES_MCP_TOOLS.filter((tool) => tool.annotations.readOnlyHint === false);
  const isWin32 = platform === "win32";
  if (isWin32 && (!bridgePath || !userDataDir)) {
    throw new Error("sites-mcp-registration: bridgePath and userDataDir are required to build a win32 registration");
  }
  return {
    label: SITES_MCP_LABEL,
    transport: "stdio",
    // Stated explicitly: `resolveSavedAuthMode` (`external-mcp-store.ts:1015`) defaults an absent
    // `authMode` to `"static_env"` for a NEW row, which would describe this connection as
    // credential-bearing when it has, and needs, none.
    authMode: "none",
    /**
     * The OPERATOR's choice, carried forward — never forced.
     *
     * `true` only when this is a brand-new row. An earlier draft sent `true` unconditionally,
     * which made the re-assert silently re-enable a connection the operator had turned off in
     * Settings: a setting they chose, reversed on next launch, with nothing telling them. The
     * self-healing property this re-assert exists for is about `command`/`args`/the allowlists
     * going stale — it was never about overriding a preference, and conflating the two was the bug.
     *
     * `enabled` cannot simply be OMITTED to mean "keep": the PUT route reads
     * `enabled: body.enabled !== false` (`put.ts:72`), so an absent key is `true`. It has to be
     * sent explicitly, which means it has to be read first — see {@link readSitesMcpEnabled}.
     */
    enabled,
    command: launcherPath,
    args: isWin32 ? `${quoteArg(bridgePath!)} --user-data-dir ${quoteArg(userDataDir!)}` : "",
    allowedToolNames: SITES_MCP_TOOLS.map((tool) => tool.name).join(","),
    writeAllowedToolNames: writeTools.map((tool) => tool.name).join(","),
    // Sent as the empty string rather than omitted, which are DIFFERENT things to the PUT route
    // (`put.ts:88-89`): omitted keeps whatever credentials are stored, empty clears them. This
    // connection must never carry credentials, so every re-assert states that rather than
    // inheriting whatever a previous row happened to hold. win32's one line is the launcher
    // script's `export ELECTRON_RUN_AS_NODE` line, restated as an env var since there is no script.
    env: isWin32 ? "ELECTRON_RUN_AS_NODE=1" : "",
  };
}

/**
 * The admin route that registers one server. A literal rather than an import for the same reason
 * `desktop-auth.ts` inlines its own paths: this directory stays self-contained, so nothing under
 * `apps/website/` has to be resolvable for this shell to build.
 *
 * @complexity O(1).
 */
function sitesMcpPutPath(workspaceId: string): string {
  return `/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/mcp-servers/${SITES_MCP_SERVER_ID}`;
}

/** The LIST route, which the `enabled` read goes through — this API has no single-row GET.
 *  @complexity O(1). */
function sitesMcpListPath(workspaceId: string): string {
  return `/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/mcp-servers`;
}

/**
 * One JSON request against a site's admin API, as the session in `deps.session`'s cookie jar.
 *
 * Shared by the `enabled` read and the registration write so the two cannot drift on the one option
 * that makes either work — `useSessionCookies`. Dropping that flag turns a call into an
 * unauthenticated request that 401s while every other signal still looks healthy, which is exactly
 * the silent failure `desktop-auth.ts`'s own doc pins a test against.
 *
 * Never rejects: an auth or transport failure comes back as `{ok: false}`. Both callers run during
 * a launch and must not be able to abort one.
 *
 * @returns `{ok, status?, body?, reason?}`; `body` is the parsed JSON when the response had any.
 * @complexity O(n) in the response size.
 */
function requestSiteAdminJson<TSession>(
  deps: { net: AdminHttpNet<TSession>; session: TSession },
  { method, url, body }: { method: "GET" | "PUT"; url: string; body?: string }
): Promise<AdminHttpResult> {
  return new Promise((resolve) => {
    const request = deps.net.request({ method, url, session: deps.session, useSessionCookies: true });
    if (body !== undefined) request.setHeader("content-type", "application/json");

    request.on("response", (response) => {
      // Consumed rather than ignored even when the content is unused: an unread body leaves the
      // socket un-reusable.
      let text = "";
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => {
        const status = response.statusCode;
        resolve(
          status >= 200 && status < 300
            ? { ok: true, status, body: parseJsonOrUndefined(text) }
            : { ok: false, status, reason: `${method} responded ${status}` },
        );
      });
    });
    request.on("error", (error) => resolve({ ok: false, reason: error.message }));

    if (body !== undefined) request.write(body);
    request.end();
  });
}

/** @complexity O(n) in the text length. */
function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Whether this connection is enabled on the site, as the OPERATOR last left it.
 *
 * Three answers, and the third is the whole reason this is a tri-state rather than a boolean:
 *
 * - `{state: "present", enabled}` — the row exists; carry its value forward verbatim.
 * - `{state: "absent"}` — the list read fine and holds no row for this server id. A first
 *   registration, so `enabled: true` is correct.
 * - `{state: "unknown"}` — the list could not be read. **The caller must then NOT write.** The two
 *   cases it cannot tell apart are "no row yet" (writing is right) and "a row the operator
 *   disabled" (writing reverses their choice, silently). Declining is the only answer that cannot
 *   override a setting, and it forfeits nothing real: a site whose admin API will not answer a GET
 *   is one whose PUT was not going to land either.
 *
 * @complexity O(n) in the configured-server count.
 */
async function readSitesMcpEnabled<TSession>(deps: RegistrationDeps<TSession>): Promise<SitesMcpEnabledState> {
  const result = await requestSiteAdminJson(deps, {
    method: "GET",
    url: new URL(sitesMcpListPath(deps.workspaceId), deps.adminUrl).toString(),
  });
  if (!result.ok) return { state: "unknown", reason: result.reason };

  const servers = result.body?.servers;
  if (!Array.isArray(servers)) {
    return { state: "unknown", reason: "the external-MCP list response carried no servers array" };
  }

  const row = servers.find((server) => server?.serverId === SITES_MCP_SERVER_ID);
  return row === undefined ? { state: "absent" } : { state: "present", enabled: row.enabled !== false };
}

/**
 * PUT the row, authenticated as the site session this shell already holds.
 *
 * Reuses the cookie jar `ensureSiteSession` (`main.ts`) populated moments earlier rather than
 * minting any new credential: the boot token is single-use and already spent, and the session in
 * that partition is an ordinary revocable admin session belonging to the operator. `useSessionCookies`
 * is what sends it — dropping that flag turns this into an unauthenticated request that 401s while
 * every other signal still looks healthy, which is exactly the failure `desktop-auth.ts`'s own doc
 * pins a test against.
 *
 * **Never throws for a failed registration.** A site whose assistant lacks the desktop tools is a
 * degraded site, not a broken one, and the operator is mid-launch — so this reports and the caller
 * carries on opening the window. The one exception is a non-loopback `adminUrl`, which is a wiring
 * bug rather than an outcome, and is the caller's to catch.
 *
 * @param deps.net Electron's `net` (injectable test seam).
 * @param deps.session the Electron `Session` whose jar holds this site's admin cookie.
 * @param deps.adminUrl the site's own `tovu serve` admin URL.
 * @param deps.workspaceId the site's workspace id — from `startTovuServer`'s parsed boot line
 *   (`tovu-server.ts:29,569`), never a hard-coded `"workspace-local"`: `resolveWorkspace`
 *   (`apps/website/src/platform/site-dir/resolve-workspace.ts`) picks the single or oldest workspace
 *   row and an operator can serve a different one with `--workspace`, so assuming the id would 404
 *   through `guardExternalMcpRequest`'s workspace check on exactly the sites that differ.
 * @param deps.platform, deps.bridgePath, deps.userDataDir forwarded verbatim into
 *   {@link buildSitesMcpRegistration} — see that function's own doc for the win32 branch they drive.
 *   All three are optional and unused on POSIX, matching that function's own defaults.
 * **Read before write, specifically to preserve one field.** {@link readSitesMcpEnabled} runs first
 * so an operator who DISABLED this connection in Settings keeps it disabled — the re-assert exists
 * to repair a stale `command` or allowlist, never to reverse a choice they made. When that read
 * cannot tell (`"unknown"`), nothing is written at all; see its own doc for why that is the only
 * safe direction.
 *
 * @returns `{ok, status?, reason?}` — `ok` only on a 2xx. `skipped: true` accompanies the refusal
 *   when the `enabled` state could not be read, so a caller can tell "declined on purpose" from
 *   "the server said no".
 * @complexity O(1) — two requests.
 */
async function registerSitesMcpServer<TSession>(
  deps: RegistrationDeps<TSession> & {
    launcherPath: string;
    platform?: NodeJS.Platform;
    bridgePath?: string;
    userDataDir?: string;
  }
): Promise<{ ok: boolean; status?: number; reason?: string; skipped?: boolean }> {
  const existing = await readSitesMcpEnabled(deps);
  if (existing.state === "unknown") {
    return { ok: false, skipped: true, reason: `could not read the site's external-MCP list (${existing.reason}), so nothing was changed` };
  }

  const result = await requestSiteAdminJson(deps, {
    method: "PUT",
    url: new URL(sitesMcpPutPath(deps.workspaceId), deps.adminUrl).toString(),
    body: JSON.stringify(
      buildSitesMcpRegistration({
        launcherPath: deps.launcherPath,
        // `absent` is a first registration; `present` carries the operator's own value forward.
        enabled: existing.state === "absent" ? true : existing.enabled,
        platform: deps.platform,
        bridgePath: deps.bridgePath,
        userDataDir: deps.userDataDir,
      }),
    ),
  });

  return result.ok
    ? { ok: true, status: result.status }
    : { ok: false, status: result.status, reason: `registering the desktop MCP server ${result.reason}` };
}

export {
  SITES_MCP_LABEL,
  SITES_MCP_LAUNCHER_NAME,
  SITES_MCP_SERVER_ID,
  buildSitesMcpLauncherScript,
  buildSitesMcpRegistration,
  readSitesMcpEnabled,
  sitesMcpListPath,
  sitesMcpPutPath,
  registerSitesMcpServer,
  writeSitesMcpLauncher,
};
export type { AdminHttpNet, AdminHttpRequest, AdminHttpResponse, AdminHttpRequestOptions, SitesMcpRegistrationBody };
