/** CMS ZIP policy. Parsing/streaming is the published Jini reader, never a custom ZIP parser.
 * Keep unreviewed bytes off disk; the normal installer alone may publish a verified package.
 *
 * Thin binder (EXTRACT-S6 L1c): the bounded policy (limits, path/alias/duplicate/file-directory
 * defenses, streamed counts, error codes and text) lives in `@jini-ai/plugins/host/node`'s
 * `readPluginArchive`. This module keeps the concrete reader — the yauzl-backed agent-plugins reader
 * plus `guardedYauzl`'s special-Unix-entry refusal — and the old optional test-reader signature.
 */
import * as yauzl from "yauzl";
import { createYauzlAgentPluginArchiveReader, type YauzlEntry, type YauzlPort } from "@jini-ai/agent-plugins/lifecycle/yauzl";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { PluginInstallError, readPluginArchive } from "@jini-ai/plugins/host/node";

export { MAX_PLUGIN_ARCHIVE_BYTES } from "@jini-ai/plugins/host/node";

/** True for a Unix-authored entry whose file-type bits are neither unset, a regular file nor a directory. */
function isSpecialUnixEntry(required: { entry: YauzlEntry }): boolean {
  const kind = (required.entry.externalFileAttributes >>> 16) & 0xf000;
  return (required.entry.versionMadeBy >>> 8) === 3 && kind !== 0 && kind !== 0x8000 && kind !== 0x4000;
}

// Compatibility guard for published Jini readers that classify a trailing slash before Unix mode.
// The shared reader fix is in Jini; this job cannot publish it. Also refuse special Unix entries.
const guardedYauzl: YauzlPort = {
  async fromBufferPromise(buffer, options) {
    const zip = await (yauzl as unknown as YauzlPort).fromBufferPromise(buffer, options);
    return {
      close: () => zip.close(),
      openReadStreamPromise: (entry) => zip.openReadStreamPromise(entry),
      async *eachEntry() {
        for await (const entry of zip.eachEntry()) {
          if (isSpecialUnixEntry({ entry })) throw new PluginInstallError("PLUGIN_PACKAGE_UNSAFE", "ZIP links and special entries are not allowed.");
          yield entry;
        }
      },
    };
  },
};
const defaultReader = createYauzlAgentPluginArchiveReader({ yauzl: guardedYauzl });

export async function readSitePluginArchive(
  required: { archive: Uint8Array },
  optional: { reader?: AgentPluginArchiveReaderPort } = {},
): Promise<Map<string, Buffer>> {
  return readPluginArchive({ archive: required.archive, reader: optional.reader ?? defaultReader });
}
