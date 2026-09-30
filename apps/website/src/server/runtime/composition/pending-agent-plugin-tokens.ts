import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { SecretSealerPort } from "#src/features/webhooks/ports";
import { ensureSiteKey } from "#src/features/webhooks/site-key-ensure";
import type { SealedSecret } from "#src/features/webhooks/types";

import { siteSecretSealer } from "./storage-secret.js";

/**
 * @file Access tokens typed into create-site onboarding, held for the NEW site until it first boots.
 *
 * The admin that creates a site runs as a different site: it cannot write the new site's plugin rows,
 * whose store, workspace and plugins only exist once that site boots. So the route seals each token
 * with the new site's own key (the way `storage-secret.ts` seals a Postgres connection string) into
 * {@link PENDING_AGENT_PLUGIN_TOKENS_FILENAME}, and the new site's first boot opens it with its own
 * sealer, hands each token to `features/agent-plugins/import-access-token.ts`, and deletes the file.
 *
 * Generic: keyed by plugin id, never by vendor. Errors never carry a token or the sealer's message.
 */

export const PENDING_AGENT_PLUGIN_TOKENS_FILENAME = ".pending-agent-plugin-tokens.json";

interface PendingTokensFile {
  version: 1;
  tokens: Record<string, SealedSecret>;
}

/** Binds a ciphertext to its plugin id, so one plugin's token never opens as another's. */
function pendingTokenAad(pluginId: string): string {
  return `tovu:agent-plugin-pending-token:v1:${pluginId}`;
}

/**
 * Makes sure the new site's key exists (as `sealConnectionStringForNewSite` does), then seals every
 * token into the site folder (0600, temp file then rename).
 *
 * @throws {Error} The site key could not be made, or the write failed. The message names no token.
 * @complexity One seal per token, one small file write.
 */
export async function sealPendingAgentPluginTokensForNewSite(required: {
  siteDir: string;
  siteKeyId: string;
  tokens: Readonly<Record<string, string>>;
}): Promise<void> {
  const { siteDir, siteKeyId, tokens } = required;
  // A site being created holds no key-dependent data yet.
  const ensured = await ensureSiteKey({ siteDir, siteKeyId, findSiteKeyDependentData: async () => false });
  if (ensured.action === "invalid" || ensured.action === "refuse") {
    throw new Error(`could not prepare the new site's key to store its access tokens (${ensured.action})`);
  }
  const { sealer, keyring } = siteSecretSealer(siteDir, process.env, siteKeyId);
  const key = await keyring.activeKey();
  const file: PendingTokensFile = { version: 1, tokens: {} };
  for (const [pluginId, token] of Object.entries(tokens)) {
    file.tokens[pluginId] = await sealer.seal({ plaintext: token, key, aad: pendingTokenAad(pluginId) });
  }
  const target = path.join(siteDir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME);
  const temp = path.join(siteDir, `.${PENDING_AGENT_PLUGIN_TOKENS_FILENAME}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(temp, JSON.stringify(file, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
}

export interface PendingTokenLog {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * Boot: opens `siteDir`'s pending tokens with this site's sealer and passes each to `importToken`.
 * The file is deleted once every token was handled (saved, or the row already had a credential); a
 * token whose import threw stays for the next boot. A file that will not open is removed with a
 * warning, since no later boot could open it either. Never throws.
 *
 * @complexity One open and one import per pending token.
 */
export async function applyPendingAgentPluginTokens(
  required: {
    siteDir: string;
    sealer: SecretSealerPort;
    importToken: (pluginId: string, token: string) => Promise<"saved" | "saved-left-off" | "already-connected">;
  },
  log: PendingTokenLog,
): Promise<void> {
  const target = path.join(required.siteDir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME);
  let file: PendingTokensFile;
  try {
    file = JSON.parse(fs.readFileSync(target, "utf8")) as PendingTokensFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    log.warn(`[agent-plugins] ${target} is not valid JSON; removing it. Connect the plugin from chat instead.`);
    fs.rmSync(target, { force: true });
    return;
  }
  const remaining: Record<string, SealedSecret> = {};
  for (const [pluginId, sealed] of Object.entries(file?.tokens ?? {})) {
    let token: string;
    try {
      token = await required.sealer.open({ sealed, aad: pendingTokenAad(pluginId) });
    } catch {
      log.warn(`[agent-plugins] the access token saved for '${pluginId}' when this site was created does not open with this site's key; it was dropped. Connect '${pluginId}' from chat instead.`);
      continue;
    }
    try {
      const outcome = await required.importToken(pluginId, token);
      if (outcome === "saved") log.info(`[agent-plugins] connected '${pluginId}' with the access token given when this site was created.`);
      if (outcome === "saved-left-off") log.info(`[agent-plugins] saved the access token given for '${pluginId}' when this site was created; it stays off because an operator turned it off.`);
    } catch (err) {
      remaining[pluginId] = sealed;
      log.warn(`[agent-plugins] could not connect '${pluginId}' with the access token given when this site was created (will retry next start): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (Object.keys(remaining).length === 0) {
    fs.rmSync(target, { force: true });
    return;
  }
  const next: PendingTokensFile = { version: 1, tokens: remaining };
  fs.writeFileSync(target, JSON.stringify(next, null, 2), { mode: 0o600 });
}
