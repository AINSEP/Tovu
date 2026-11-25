import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { readPluginInstallRequest, readPluginInstallArchive } from '@jini-ai/plugins/runtime/install-source';
import type { PluginInstallSourcePort, InstallArchiveFiles } from '@jini-ai/core/contracts/headless/plugin-install-source';

const nodeArchiveFiles: InstallArchiveFiles = {
  stat: ({ path: sourcePath }, _optional) => stat(sourcePath),
  read: ({ path: sourcePath }, _optional) => readFile(sourcePath),
};

export function createHostPluginInstallSource(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): PluginInstallSourcePort {
  return {
    readRequest: ({ input }) => readPluginInstallRequest({ input, isAbsolutePath: ({ path: value }) => path.isAbsolute(value),
      absolutePathMessage: "source.path must be an absolute path on the machine Tovu runs on (expand ~ first)." }),
    readArchive: (required, optional = {}) => readPluginInstallArchive({ ...required, files: optional.files ?? nodeArchiveFiles,
      messages: {
        attachmentUnavailable: "Chat ZIP attachment is unavailable or exceeds the 32 MiB upload limit. Use an attachmentRef listed by chat_list_pending_attachments.",
        tooLarge: "ZIP exceeds the 32 MiB upload limit.",
        noReadableZip: ({ path }) => `No readable ZIP at ${path}.`,
      } }, optional.readAttachment === undefined ? {} : { readAttachment: optional.readAttachment }),
  };
}
