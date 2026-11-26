/** CMS ZIP policy. Parsing/streaming is the published Jini reader, never a custom ZIP parser.
 * Keep unreviewed bytes off disk; the normal installer alone may publish a verified package.
 *
 * Thin binder (EXTRACT-S6 L1c): the bounded policy (limits, path/alias/duplicate/file-directory
 * defenses, streamed counts, error codes and text) lives in `@jini-ai/plugins/host/node`'s
 * `readPluginArchive`. This module keeps the concrete reader — the yauzl-backed agent-plugins reader
 * plus `guardedYauzl`'s special-Unix-entry refusal — and the old optional test-reader signature.
 */
import * as yauzl from "yauzl";
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from "@jini-ai/agent-plugins/lifecycle/yauzl";
import { PluginInstallError, readPluginArchive } from "@jini-ai/plugins/host/node";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/core/contracts/site/agent-plugins-lifecycle";


const defaultReader = createYauzlAgentPluginArchiveReader({ yauzl: yauzl as unknown as YauzlPort }, {
  rejectSpecialUnixEntry: () => { throw new PluginInstallError("PLUGIN_PACKAGE_UNSAFE", "ZIP links and special entries are not allowed."); },
});

export async function readSitePluginArchive(
  required: { archive: Uint8Array },
  optional: { reader?: AgentPluginArchiveReaderPort } = {},
): Promise<Map<string, Buffer>> {
  return readPluginArchive({ archive: required.archive, reader: optional.reader ?? defaultReader });
}
