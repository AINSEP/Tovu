import path from "node:path";

import {
  nodeProvisioningFileIo,
  resolveCommittedConfigRoot,
} from "#src/features/publish-trust/provisioning.node-io";
import {
  PUBLISH_TRUST_CONFIG_PATH,
  PUBLISH_TRUST_ENV_VAR,
  resolvePublishTrust,
  type PublishTrustResolution,
} from "#src/features/publish-trust/provisioning";

/**
 * @file Zero-setup publishing auth — where the destination's grants come from at run time.
 *
 * The composition-root half of `features/publish-trust/provisioning.ts`: that module owns the
 * precedence rule and every parse, and is pure so it can be tested without a disk or a process
 * env; this one performs the two reads it needs. Kept apart for that reason, and because reading
 * `process.env` is a composition concern rather than a feature one.
 */

/** Resolves the grants this install accepts publishes from. */
export type PublishTrustGrantResolver = () => Promise<PublishTrustResolution>;

/**
 * Builds a resolver that reads the environment and the committed config file ONCE per process and
 * serves every later call from that answer.
 *
 * Read once, not per request, because this is deploy config: it cannot change under a running
 * process, and re-reading it would put a filesystem call on the authentication path of every
 * publishing request. A deploy restarts the process, so a change still takes effect on deploy —
 * which is the channel the whole design uses.
 *
 * The read is lazy rather than at boot so an install that never publishes never touches the disk,
 * and so a slow or failing read delays the first handshake instead of startup. An unreadable
 * config resolves to `invalid` — which carries no grants and therefore authorises nothing — rather
 * than rejecting: a throw on the authentication path would be a 500 where a 401 belongs, and that
 * is an oracle. The failure is not cached, so a transient error retries on the next call.
 *
 * `PUBLISH_TRUST_CONFIG_PATH` is relative, and resolved against {@link resolveCommittedConfigRoot}
 * — `process.cwd()` for a normal `tovu serve` or the deployed container, where it IS the repo root,
 * but not for the desktop shell, whose own-server-mode cwd is wherever opened Electron. The file is
 * committed deploy config, so it belongs to the repo rather than to a site directory regardless of
 * which of those launched this process.
 *
 * @complexity O(1) per call after the first; the first reads one file.
 */
export function createPublishTrustGrantResolver(
  env: NodeJS.ProcessEnv = process.env
): PublishTrustGrantResolver {
  let cached: Promise<PublishTrustResolution> | null = null;

  return () => {
    if (cached) return cached;
    cached = (async () => {
      // `undefined` (unset) and `""` (set but empty) mean different things to `resolvePublishTrust`
      // — the empty value is the provider-console kill switch — so this must not collapse them.
      const envValue = env[PUBLISH_TRUST_ENV_VAR];
      const configPath = path.join(resolveCommittedConfigRoot(env), PUBLISH_TRUST_CONFIG_PATH);
      const fileContents = await nodeProvisioningFileIo.read(configPath);
      return resolvePublishTrust({ envValue, fileContents });
    })().catch((error: unknown) => {
      cached = null;
      return {
        state: "invalid" as const,
        origin: "none" as const,
        grants: [],
        reason: `the publishing config could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    });
    return cached;
  };
}
