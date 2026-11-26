import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { bindAgentPluginUpload } from "@jini-ai/agent-plugins/site/install-upload";
import { createHash } from "node:crypto";
import path from "node:path";
import { lstat } from "node:fs/promises";
import * as yauzl from "yauzl";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { readInstalledAgentPluginIdentity } from "@jini-ai/agent-plugins/lifecycle/host-tools";
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from "@jini-ai/agent-plugins/lifecycle/yauzl";
import { assertOwnedPluginPath } from "./memory.js";
import { containAgentPluginStatePath, createTovuAgentPluginLifecycle, installAgentPlugin, listInstalledPlugins, maxAgentPluginInstallArchiveBytes, stageForRemoval, restoreStagedTrees, removeFrozenPackageTree } from "./lifecycle.js";
import { agentPluginActivations } from "./activation-effects.js";
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "./identity-read-policy.js";

/**
 * @file `installUploadedAgentPlugin()` — the admin "Add a plugin" upload: one operator-supplied
 * `.zip` of an agent-plugins.org package, installed for one workspace and left switched OFF.
 *
 * No second install path. Extraction, containment, size caps, the digest check and publication are
 * all `installAgentPlugin()`'s (`install.ts`), exactly as the bundled seed uses it; this module only
 * adds what an upload needs that a bundled source never does:
 *
 * - A real ZIP reader: Jini's published yauzl adapter, the same one `plugin-runtime/install-archive.ts`
 *   uses for site-plugin uploads, adapted to `install.ts`'s own reader port.
 * - One wrapping folder is accepted. Zipping a folder (macOS "Compress", a GitHub download) puts
 *   every file under `<folder>/`, plus `__MACOSX/` noise; `install.ts` wants `plugin.json` at the
 *   root. When the root has no `plugin.json` but exactly one top-level folder does, that folder is
 *   the package and everything outside it is dropped. Every path is still re-checked by `install.ts`.
 * - Replacing a disabled operator-installed plugin is explicit. Old digests are staged aside and
 *   restored on publication failure; memory stays in place. The per-plugin lock prevents ambiguous
 *   id races. Identical bytes are a harmless no-op instead.
 * - It stays off. An absent activation record reads as ACTIVE (operator installs predate the
 *   record), so the disabled `operator-installed` record is written BEFORE the package is
 *   published, the same order the bundled seed uses. A failed install leaves only that inert record.
 *
 * Nothing in an uploaded package runs: skills are markdown, and code seams only trust bundled
 * digests (`trusted-plugin-files.ts`).
 */
export const { installUploadedAgentPlugin, previewUploadedAgentPlugin } = bindAgentPluginUpload({
  archiveReader: () => createYauzlAgentPluginArchiveReader({ yauzl: yauzl as unknown as YauzlPort }),
  lifecycle: {
    installAgentPlugin, listInstalledPlugins, stageForRemoval, restoreStagedTrees, removeFrozenPackageTree,
    setAgentPluginActivation: (required, optional) => agentPluginActivations.setAgentPluginActivation(required, optional),
    isAgentPluginRecordedAsBundled: required => agentPluginActivations.isAgentPluginRecordedAsBundled(required),
    resolveAgentPluginActivation: required => agentPluginActivations.resolveAgentPluginActivation(required),
  },
  createLifecycle: createTovuAgentPluginLifecycle,
  assertOwnedPluginPath,
  contain: containAgentPluginStatePath,
  parseManifest: required => parseAgentPluginManifest(required, TOVU_AGENT_PLUGIN_IDENTITY_READ),
  readInstallIdentity: required => readInstalledAgentPluginIdentity(required, TOVU_AGENT_PLUGIN_IDENTITY_READ),
  sha256: archive => createHash("sha256").update(archive).digest("hex"),
  maxAgentPluginInstallArchiveBytes,
  path,
  lstat,
  warnCleanup: ({ pluginId, error }) => console.warn(`[agent-plugins] retired package cleanup pending for '${pluginId}' ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`),
});
