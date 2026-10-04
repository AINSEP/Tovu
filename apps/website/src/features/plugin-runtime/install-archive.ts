/** CMS ZIP policy. Parsing/streaming is the published Jini reader, never a custom ZIP parser.
 * Keep unreviewed bytes off disk; the normal installer alone may publish a verified package.
 */
import * as yauzl from "yauzl";
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from "@jini-ai/agent-plugins/lifecycle/yauzl";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { PluginInstallError } from "./install.js";

export const MAX_PLUGIN_ARCHIVE_BYTES = 32 * 1024 * 1024;
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
          const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
          if ((entry.versionMadeBy >>> 8) === 3 && kind !== 0 && kind !== 0x8000 && kind !== 0x4000) throw new PluginInstallError("PLUGIN_PACKAGE_UNSAFE", "ZIP links and special entries are not allowed.");
          yield entry;
        }
      },
    };
  },
};
const defaultReader = createYauzlAgentPluginArchiveReader({ yauzl: guardedYauzl });

function fail(code: string, message: string): never { throw new PluginInstallError(code, message); }

export async function readSitePluginArchive(
  required: { archive: Uint8Array },
  optional: { reader?: AgentPluginArchiveReaderPort } = {},
): Promise<Map<string, Buffer>> {
  if (required.archive.byteLength > MAX_PLUGIN_ARCHIVE_BYTES) fail("PLUGIN_PACKAGE_TOO_LARGE", "ZIP exceeds the 32 MiB upload limit.");
  const files = new Map<string, Buffer>();
  const paths = new Map<string, "file" | "directory">();
  // A case-insensitive directory alias can merge two trees on macOS/Windows at publication.
  const spellings = new Map<string, string>();
  let entries = 0; let total = 0;
  try {
    for await (const entry of (optional.reader ?? defaultReader).entries({ archive: required.archive })) {
      if (++entries > 4096) fail("PLUGIN_PACKAGE_TOO_LARGE", "ZIP has too many entries.");
      if (entry.kind !== "file" && entry.kind !== "directory") fail("PLUGIN_PACKAGE_UNSAFE", "ZIP links are not allowed.");
      const name = entry.entryPath.replaceAll("\\", "/");
      const key = entry.kind === "directory" ? name.replace(/\/$/, "") : name;
      const segments = key.split("/");
      if (!key || key.includes("\0") || key.startsWith("/") || /^[a-zA-Z]:/.test(key) || segments.some((s) => !s || s === "." || s === ".." || s.includes(":"))) fail("PLUGIN_PACKAGE_UNSAFE", "ZIP paths must stay inside the package.");
      if (paths.has(key)) fail("PLUGIN_PACKAGE_UNSAFE", "ZIP has duplicate paths.");
      for (let i = 1; i <= segments.length; i++) {
        const prefix = segments.slice(0, i).join("/");
        const lower = prefix.toLowerCase();
        if (spellings.has(lower) && spellings.get(lower) !== prefix) fail("PLUGIN_PACKAGE_UNSAFE", "ZIP has case-aliased paths.");
        spellings.set(lower, prefix);
        if (spellings.size > 4096) fail("PLUGIN_PACKAGE_TOO_LARGE", "ZIP has too many files and directories.");
        if (i < segments.length && paths.get(prefix) === "file") fail("PLUGIN_PACKAGE_UNSAFE", "ZIP path crosses a file.");
      }
      if (entry.kind === "file" && [...paths.keys()].some((p) => p.startsWith(key + "/"))) fail("PLUGIN_PACKAGE_UNSAFE", "ZIP file replaces a directory.");
      paths.set(key, entry.kind);
      if (entry.kind === "directory") continue;
      if (entry.declaredSize !== undefined && (!Number.isSafeInteger(entry.declaredSize) || entry.declaredSize < 0 || entry.declaredSize > 16 * 1024 * 1024 || total + entry.declaredSize > 64 * 1024 * 1024)) fail("PLUGIN_PACKAGE_TOO_LARGE", "ZIP exceeds the file or expanded size limit.");
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of entry.openReadStream({})) {
        length += chunk.byteLength; total += chunk.byteLength;
        if (length > 16 * 1024 * 1024 || total > 64 * 1024 * 1024) fail("PLUGIN_PACKAGE_TOO_LARGE", "ZIP exceeds the file or expanded size limit.");
        chunks.push(Buffer.from(chunk));
      }
      files.set(key, Buffer.concat(chunks, length));
    }
    return files;
  } catch (error) {
    if (error instanceof PluginInstallError) throw error;
    fail("PLUGIN_ARCHIVE_INVALID", "ZIP could not be read safely.");
  }
}
