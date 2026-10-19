import * as yauzl from 'yauzl';
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from '@jini-ai/agent-plugins/lifecycle/yauzl';
import type { DocumentArchiveReaderPort } from '@jini-ai/cms/media';

/** Reuse the installed streaming ZIP owner. The guard exposes no encrypted/special entries to
 * document validation; media owns package policy and aggregate bounds, the reader owns streams. */
export function createDocumentArchiveReader(_required: Record<string, never>,
  _optional: Record<string, never> = {}): DocumentArchiveReaderPort {
  const sdk = yauzl as unknown as YauzlPort;
  return { async *entries(required) {
    // Preserve ZIP metadata without duplicating the shared reader's streaming/cleanup lifecycle.
    const compressedSizes = new Map<string, number>();
    const reader = createYauzlAgentPluginArchiveReader({ yauzl: {
      async fromBufferPromise(buffer, options) {
        const zip = await sdk.fromBufferPromise(buffer, { ...options, strictFileNames: true } as typeof options);
        return {
          async *eachEntry() {
            for await (const entry of zip.eachEntry()) {
              const flags = (entry as typeof entry & { generalPurposeBitFlag: number }).generalPurposeBitFlag;
              const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
              if ((flags & 0x41) !== 0 || ((entry.versionMadeBy >>> 8) === 3 && mode !== 0 && ![0x8000, 0x4000].includes(mode))) {
                throw new Error('encrypted or special ZIP entry');
              }
              compressedSizes.set(entry.fileName, (entry as typeof entry & { compressedSize: number }).compressedSize);
              yield entry;
            }
          },
          openReadStreamPromise: entry => zip.openReadStreamPromise(entry),
          close: () => zip.close(),
        };
      },
    } });
    for await (const entry of reader.entries(required)) {
      yield { ...entry, compressedSize: compressedSizes.get(entry.entryPath) };
    }
  } };
}
