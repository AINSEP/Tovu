/**
 * @file The one Tovu boot environment schema.
 *
 * Each process (the website listener, the desktop shell, the agent daemon child) reads its own
 * field group exactly once, after its dotenv/explicit launch inputs resolve and before it opens a
 * listener, a store or a child process. Reads are strict: a present-but-invalid value stops boot
 * with an error that names the variable and never echoes its value. An unset value stays
 * `undefined`, so each entry keeps its own existing default rather than gaining a new one here.
 *
 * This module imports nothing from the website server, so a non-website process can load it.
 */
import { defineEnvSchema, readEnv } from "@jini-ai/core/config/env-schema";
import type { EnvValues, EnvVarField, EnvVars } from "@jini-ai/core/config/env-schema";

type HostEnvironment = Readonly<Record<string, string | undefined>>;

/** Any text, or unset. For names whose own caller already validates (or tolerates) the value. */
function optionalText({ description }: { description: string }, _optional = {}): EnvVarField<string | undefined> {
  return { description, parse: ({ raw }) => ({ ok: true, value: raw }) };
}

/**
 * A supplied listener port. `allowZero` is the daemon's explicit "allocate one for me" sentinel; the
 * website listener has no such sentinel, so a supplied fixed port there is `1..65535` only.
 */
function optionalPort({ description, allowZero }: { description: string; allowZero: boolean }, _optional = {}): EnvVarField<number | undefined> {
  const min = allowZero ? 0 : 1;
  return {
    description,
    parse: ({ raw }) => {
      if (raw === undefined) return { ok: true, value: undefined };
      const text = raw.trim();
      if (!/^\d+$/.test(text)) return { ok: false };
      const value = Number(text);
      return value >= min && value <= 65535 ? { ok: true, value } : { ok: false };
    },
  };
}

// Listener identity, child inheritance, and allowed origins are independent policies. So each
// process gets its own group, and look-alike names (`PORT` vs `JINI_AGENT_DAEMON_PORT`, `TOVU_HOST` vs
// `HOST`/`JINI_BIND_HOST`) are never unioned or aliased across groups.
const TOVU_ENV_GROUPS = {
  website: defineEnvSchema({ vars: {
    PORT: optionalPort({ description: "must be a whole number from 1 to 65535 when set (the website listener port).", allowZero: false }),
    TOVU_START_AUTO_PORT: optionalText({ description: "is the launcher's explicit auto-port request; '1' turns it on." }),
    TOVU_HOST: optionalText({ description: "is the address the website listener binds to." }),
    TOVU_DB: optionalText({ description: "selects the content store; 'memory' means an ephemeral store." }),
    TOVU_CHAT_DB: optionalText({ description: "is the legacy chat database path." }),
    TOVU_CONTENT_DB: optionalText({ description: "is the content database path." }),
    TOVU_PLUGINS_DIR: optionalText({ description: "is the plugin install directory for an in-memory store." }),
    TOVU_RUNNING_APP: optionalText({ description: "names the app that launched this server." }),
  } }),
  // The desktop shell's own launch inputs. `TOVU_DESKTOP_PORT` pins the first own-server site's
  // listener, so it gets the website's fixed-port range; there is no zero sentinel here.
  desktop: defineEnvSchema({ vars: {
    TOVU_DESKTOP_SELFTEST: optionalText({ description: "turns on the desktop self-test when '1'." }),
    TOVU_DESKTOP_USER_DATA_DIR: optionalText({ description: "is the desktop profile directory override." }),
    TOVU_DESKTOP_PORT: optionalPort({ description: "must be a whole number from 1 to 65535 when set (the first desktop site's port).", allowZero: false }),
    TOVU_DESKTOP_CLI_MODE: optionalText({ description: "is 'source' or 'compiled'; any other value keeps the default." }),
    TOVU_DESKTOP_UI: optionalText({ description: "is 'runner' to open the sites home explicitly." }),
    TOVU_DESKTOP_URL: optionalText({ description: "is an origin to attach to instead of starting a server." }),
    TOVU_DESKTOP_SITE_DIR: optionalText({ description: "is the one site directory to open." }),
    TOVU_DESKTOP_SITE_DIRS: optionalText({ description: "is a comma-separated list of site directories to open." }),
  } }),
  daemon: defineEnvSchema({ vars: {
    JINI_AGENT_DAEMON_PORT: optionalPort({ description: "must be 0 or a whole number from 1 to 65535 when set (the agent daemon port).", allowZero: true }),
    TOVU_AGENT_DAEMON_STANDALONE: optionalText({ description: "runs the agent daemon without a parent host when '1'." }),
    TOVU_AGENT_DAEMON_REGISTRY_PATH: optionalText({ description: "is the agent daemon registry file." }),
    // The daemon's origin policy only: the parent pins the resolved website listener here, and a
    // standalone daemon keeps the old `JINI_WEB_PORT` input (see `daemon-origin-policy.ts`).
    TOVU_SITE_LISTENER_ORIGIN: optionalText({ description: "is the website listener origin the parent host pinned." }),
    JINI_WEB_PORT: optionalText({ description: "is the website origin port a standalone agent daemon also treats as local." }),
  } }),
} as const;

export type TovuBootScope = keyof typeof TOVU_ENV_GROUPS;
type GroupVars<S extends TovuBootScope> = (typeof TOVU_ENV_GROUPS)[S]["vars"];
export type TovuBootConfig<S extends TovuBootScope> = Readonly<EnvValues<GroupVars<S>>>;

/** An older name for a canonical variable in the same process scope. */
export interface TovuEnvAlias { readonly canonical: string; readonly legacy: string }
export type TovuEnvAliases = Readonly<Partial<Record<TovuBootScope, readonly TovuEnvAlias[]>>>;

/**
 * Verified same-scope old names. Empty today: every look-alike checked so far has a distinct caller
 * or trust scope (see the groups above), and P9's engine renames have not landed yet.
 */
const TOVU_ENV_ALIASES: TovuEnvAliases = {};

/** Canonical wins; an old name that is set produces one name-only warning per read. */
function applyAliases(
  { env, aliases, warn }: { env: HostEnvironment; aliases: readonly TovuEnvAlias[]; warn: (required: { message: string }) => void },
  _optional = {},
): HostEnvironment {
  const resolved: Record<string, string | undefined> = { ...env };
  for (const { canonical, legacy } of aliases) {
    if (env[legacy] === undefined) continue;
    if (env[canonical] === undefined) {
      resolved[canonical] = env[legacy];
      warn({ message: `${legacy} is an old name for ${canonical}; rename it to ${canonical}.` });
    } else {
      warn({ message: `${legacy} is ignored because ${canonical} is also set; remove ${legacy}.` });
    }
  }
  return resolved;
}

/**
 * Read and validate one process's boot environment. Throws `EnvConfigError` (variable names and
 * what each must be, never values) when a supplied value is invalid.
 */
export function readTovuBootEnv<S extends TovuBootScope>(
  { env, scope, warn }: { env: HostEnvironment; scope: S; warn: (required: { message: string }) => void },
  { aliases = TOVU_ENV_ALIASES }: { aliases?: TovuEnvAliases } = {},
): TovuBootConfig<S> {
  const resolved = applyAliases({ env, aliases: aliases[scope] ?? [], warn });
  const schema: Readonly<{ vars: EnvVars }> = TOVU_ENV_GROUPS[scope];
  return readEnv({ schema, env: resolved }) as TovuBootConfig<S>;
}

/** Every declared name, per scope — the inventory the env-read check compares source reads against. */
export function declaredTovuEnvNames(_required = {}, _optional = {}): Readonly<Record<TovuBootScope, readonly string[]>> {
  return {
    website: Object.keys(TOVU_ENV_GROUPS.website.vars),
    desktop: Object.keys(TOVU_ENV_GROUPS.desktop.vars),
    daemon: Object.keys(TOVU_ENV_GROUPS.daemon.vars),
  };
}
