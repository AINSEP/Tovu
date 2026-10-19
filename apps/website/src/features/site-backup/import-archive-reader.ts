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
            const local = entry.relativeOffsetOfLocalHeader;
            if (local < 0 || local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50 ||
                buffer.readUInt16LE(local + 6) !== entry.generalPurposeBitFlag || buffer.readUInt16LE(local + 8) !== entry.compressionMethod ||
                buffer.subarray(local + 30, local + 30 + buffer.readUInt16LE(local + 26)).toString("utf8") !== entry.fileName) {
              throw new SiteShareRefusal({ code: "UNSAFE_ARCHIVE", message: "ZIP local and central entry headers disagree." });
            }
            const mode = entry.externalFileAttributes >>> 16;
            const type = mode & 0xf000;
            const extraStart = local + 30 + buffer.readUInt16LE(local + 26);
            const extraEnd = extraStart + buffer.readUInt16LE(local + 28);
            if (extraEnd > buffer.length) throw new SiteShareRefusal({ code: "UNSAFE_ARCHIVE", message: "Truncated ZIP local entry metadata." });
            const localExtra = required.yauzl.parseExtraFields(buffer.subarray(extraStart, extraEnd));
            // PKWARE Unix and ASi Unix fields can encode links independently of st_mode.
            // Reject these optional variants wholesale; v1 shares never emit them.
            if ((entry.generalPurposeBitFlag & (1 | 64 | 8192)) ||
                ![0, 0x8000, 0x4000].includes(type) ||
                [...entry.extraFields, ...localExtra].some(field => [0x000d, 0x756e, 0x7075, 0x9901].includes(field.id)) ||
                entry.fileName.endsWith("/") && entry.uncompressedSize !== 0 ||
                entry.fileName.endsWith("/") && type === 0x8000 ||
                !entry.fileName.endsWith("/") && type === 0x4000) {
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
