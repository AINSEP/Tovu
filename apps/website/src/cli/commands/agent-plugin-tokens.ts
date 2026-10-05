import { ValidationError } from "../../platform/site-dir/index.js";
import { createDefaultHttpClient } from "../../platform/http/client.js";
import { CUSTOM_CREDENTIALS_EGRESS_POLICY } from "../../platform/http/egress-policies.js";
import {
  bundledAgentPluginsSourceRoot,
  firstNewSiteAgentPluginTokenRefusal,
  listNewSiteAgentPluginTokenSignInPlugins,
  parseNewSiteAgentPluginTokens,
  resolveBundledAgentPlugin,
} from "../../features/agent-plugins/new-site-agent-plugin-tokens.js";
import { checkAgentPluginAccessToken, type TokenCheckOutcome } from "../../features/agent-plugins/token-sign-in.js";
import { sealPendingAgentPluginTokensForNewSite } from "../../server/runtime/composition/pending-agent-plugin-tokens.js";

/**
 * @file The CLI side of "connect services while creating a site" (2026-09-29): `tovu init
 * --agent-plugin-tokens-stdin` and `tovu agent-plugins token-sign-in --json`. The desktop app's
 * "Create website" runs these (it shells out to the CLI instead of importing `apps/website`), so it
 * offers the same optional token fields, checked and stored by the same rules
 * (`features/agent-plugins/new-site-agent-plugin-tokens.ts`) as the admin's create route.
 *
 * Tokens arrive on stdin only, never argv (visible to every process) and never env. Nothing here
 * prints a token.
 */

/** The bundled plugins' source dir (`new-site-agent-plugin-tokens.ts`). @complexity O(1). */
export function bundledAgentPluginsRoot(): string {
  return bundledAgentPluginsSourceRoot();
}

/** All of stdin as text. */
async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The `{ [pluginId]: token }` JSON object read from stdin, validated by the create route's rules.
 * @throws {ValidationError} Not JSON, or not that shape. The message never carries a token.
 */
export async function readNewSiteAgentPluginTokensFromStdin(read: () => Promise<string> = readAllStdin): Promise<Record<string, string>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await read());
  } catch {
    throw new ValidationError("init: --agent-plugin-tokens-stdin expects a JSON object on stdin");
  }
  const parsed = parseNewSiteAgentPluginTokens(raw);
  if (!parsed.ok) throw new ValidationError(`init: ${parsed.error}`);
  return parsed.tokens;
}

/** Checks one token against the bundled plugin's declared probe URL. */
export type NewSiteAgentPluginTokenCheck = (input: { pluginId: string; token: string }) => Promise<TokenCheckOutcome>;

/** The real check: the bundled plugins (the new site has no workspace yet) and the guarded client. */
export function defaultNewSiteAgentPluginTokenCheck(sourceRoot: string = bundledAgentPluginsRoot()): NewSiteAgentPluginTokenCheck {
  const httpClient = createDefaultHttpClient(CUSTOM_CREDENTIALS_EGRESS_POLICY);
  const resolveInstalledPlugin = resolveBundledAgentPlugin(sourceRoot);
  return (input) => checkAgentPluginAccessToken({ workspaceId: "new-site", httpClient, resolveInstalledPlugin }, input);
}

/**
 * Refuses before anything is created when a token is rejected or its plugin takes no token.
 * @throws {ValidationError} The same plain message the admin's create route returns.
 */
export async function assertNewSiteAgentPluginTokensAccepted(tokens: Readonly<Record<string, string>>, check: NewSiteAgentPluginTokenCheck): Promise<void> {
  const refusal = await firstNewSiteAgentPluginTokenRefusal(check, tokens);
  if (refusal) throw new ValidationError(refusal.error);
}

/** Seals the tokens into the just-created site, applied at its first boot. */
export type SealNewSiteAgentPluginTokens = (input: { siteDir: string; siteKeyId: string; tokens: Readonly<Record<string, string>> }) => Promise<void>;

/**
 * Seals the tokens and prints one `agent-plugin-tokens: saved|failed <ids>` stdout line (the desktop
 * app reads it). The site already exists, so a failure is reported, not thrown.
 */
export async function storeNewSiteAgentPluginTokens(
  site: { dir: string; siteId: string },
  tokens: Readonly<Record<string, string>>,
  seal: SealNewSiteAgentPluginTokens = sealPendingAgentPluginTokensForNewSite,
  write: (line: string) => void = (line) => void process.stdout.write(line),
): Promise<void> {
  const pluginIds = Object.keys(tokens);
  if (pluginIds.length === 0) return;
  try {
    await seal({ siteDir: site.dir, siteKeyId: site.siteId, tokens });
    write(`agent-plugin-tokens: saved ${pluginIds.join(",")}\n`);
  } catch {
    write(`agent-plugin-tokens: failed ${pluginIds.join(",")}\n`);
  }
}

/**
 * `tovu agent-plugins token-sign-in --json`: the bundled plugins a new site can be connected to with
 * a pasted token, as `{ "plugins": [{ pluginId, displayName, helpUrl }] }`.
 */
export async function runTokenSignInPluginsCommand(sourceRoot: string = bundledAgentPluginsRoot()): Promise<void> {
  const plugins = await listNewSiteAgentPluginTokenSignInPlugins(sourceRoot);
  process.stdout.write(`${JSON.stringify({ plugins })}\n`);
}
