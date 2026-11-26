import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { readChatAttachmentForOwner, type AttachmentReadPorts } from "@jini-ai/daemon/http";

export function readOwnerChatAttachment(
  { uploadDirectory, ref, ownerId }: { uploadDirectory: string; ref: string; ownerId: string },
  options: NonNullable<Parameters<typeof readChatAttachmentForOwner>[1]> & { openFile?: (filePath: string, flags: number) => ReturnType<AttachmentReadPorts["openNoFollow"]> } = {},
) {
  const { openFile = open, ...readOptions } = options;
  return readChatAttachmentForOwner({ uploadDirectory, ref, ownerId, io: {
    readSidecarText: ({ path }) => readFile(path, "utf8"),
    realpath: ({ path }) => realpath(path),
    lstat: ({ path }) => lstat(path),
    openNoFollow: ({ path }) => openFile(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)),
  } }, readOptions);
}
