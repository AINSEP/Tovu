import { createYauzlAgentPluginArchiveReader, type YauzlPort, type YauzlEntry } from "@jini-ai/agent-plugins/lifecycle/yauzl";
import type * as yauzl from "yauzl";
import { SiteShareRefusal } from "./share-policy.js";

interface ShareZipEntry extends YauzlEntry {
  generalPurposeBitFlag: number;
  compressionMethod: number;
  relativeOffsetOfLocalHeader: number;
  extraFields: readonly { id: number }[];
}
// @types/yauzl predates 3.4's promise/iterator API. Keep that adapter gap here.
interface ShareYauzl {
  fromBufferPromise(buffer: Buffer, options: { lazyEntries: boolean; validateEntrySizes: boolean; strictFileNames: boolean }): Promise<{
    eachEntry(): AsyncIterable<ShareZipEntry>;
    openReadStreamPromise(entry: ShareZipEntry): Promise<AsyncIterable<Uint8Array>>;
    close(): void;
  }>;
}

/** Refuses an entry whose local header does not restate its central entry. O(name). */
function requireMatchingLocalHeader(required: { buffer: Buffer; entry: ShareZipEntry }): void {
  const { buffer, entry } = required;
  const local = entry.relativeOffsetOfLocalHeader;
  const invalidPrefix = local < 0 || local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50;
  if (invalidPrefix || buffer.readUInt16LE(local + 6) !== entry.generalPurposeBitFlag || buffer.readUInt16LE(local + 8) !== entry.compressionMethod ||
      buffer.subarray(local + 30, local + 30 + buffer.readUInt16LE(local + 26)).toString("utf8") !== entry.fileName) {
    throw new SiteShareRefusal({ code: "UNSAFE_ARCHIVE", message: "ZIP local and central entry headers disagree." });
  }
}

/** Parses the local header's own extra fields; refuses metadata that runs past the archive. O(extra bytes). */
function readLocalExtraFields(required: { buffer: Buffer; entry: ShareZipEntry; yauzl: typeof yauzl }): readonly { id: number }[] {
  const { buffer } = required;
  const local = required.entry.relativeOffsetOfLocalHeader;
  const extraStart = local + 30 + buffer.readUInt16LE(local + 26);
  const extraEnd = extraStart + buffer.readUInt16LE(local + 28);
  if (extraEnd > buffer.length) throw new SiteShareRefusal({ code: "UNSAFE_ARCHIVE", message: "Truncated ZIP local entry metadata." });
  return required.yauzl.parseExtraFields(buffer.subarray(extraStart, extraEnd));
}

/** A trailing-slash name must be an empty, non-regular entry; any other name must not be a directory. */
function hasAmbiguousDirectoryMetadata(required: { entry: ShareZipEntry; type: number }): boolean {
  if (required.entry.fileName.endsWith("/")) return required.entry.uncompressedSize !== 0 || required.type === 0x8000;
  return required.type === 0x4000;
}

/** True for encryption, links, special entries, or ambiguous filename metadata. O(extra fields). */
function hasUnsupportedFeature(required: { entry: ShareZipEntry; localExtra: readonly { id: number }[] }): boolean {
  const { entry } = required;
  const type = (entry.externalFileAttributes >>> 16) & 0xf000;
  // PKWARE Unix and ASi Unix fields can encode links independently of st_mode.
  // Reject these optional variants wholesale; v1 shares never emit them.
  return (entry.generalPurposeBitFlag & (1 | 64 | 8192)) !== 0 ||
    ![0, 0x8000, 0x4000].includes(type) ||
    [...entry.extraFields, ...required.localExtra].some(field => [0x000d, 0x756e, 0x7075, 0x9901].includes(field.id)) ||
    hasAmbiguousDirectoryMetadata({ entry, type });
}

/** Tovu share-profile preflight over the existing Jini reader, not another ZIP decoder.
 * Reject ZIP features the portable profile cannot represent before Jini projects entries.
 * Strict filenames preserve backslashes for rejection rather than silently rewriting them.
 * @complexity O(entries); decompression and byte accounting remain with the reader/verifier.
 */
export function createShareArchiveReader(required: { yauzl: typeof yauzl }, _options: Record<string, never> = {}) {
  const port: YauzlPort = {
    async fromBufferPromise(buffer, options) {
      const zip = await (required.yauzl as unknown as ShareYauzl).fromBufferPromise(buffer, { ...options, strictFileNames: true });
      return {
        async *eachEntry() {
          for await (const entry of zip.eachEntry()) {
            requireMatchingLocalHeader({ buffer, entry });
            const localExtra = readLocalExtraFields({ buffer, entry, yauzl: required.yauzl });
            if (hasUnsupportedFeature({ entry, localExtra })) {
              throw new SiteShareRefusal({ code: "UNSAFE_ARCHIVE", message: "Share ZIP contains encryption, a link, a special entry, or ambiguous filename metadata." });
            }
            yield entry;
          }
        },
        openReadStreamPromise: entry => zip.openReadStreamPromise(entry as ShareZipEntry),
        close: () => zip.close(),
      };
    },
  };
  return createYauzlAgentPluginArchiveReader({ yauzl: port });
}
