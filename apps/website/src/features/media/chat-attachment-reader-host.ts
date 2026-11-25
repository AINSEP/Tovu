import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { readChatAttachmentForOwner, type AttachmentReadPorts } from "@jini-ai/daemon/http";

export function readOwnerChatAttachment(
  { uploadDirectory, ref, ownerId }: { uploadDirectory: string; ref: string; ownerId: string },
  { maxBytes, openFile = open }: { maxBytes?: number; openFile?: (filePath: string, flags: number) => ReturnType<AttachmentReadPorts["openNoFollow"]> } = {},
) {
  return readChatAttachmentForOwner({ uploadDirectory, ref, ownerId, io: {
    readSidecarText: ({ path }) => readFile(path, "utf8"),
    realpath: ({ path }) => realpath(path),
    lstat: ({ path }) => lstat(path),
    openNoFollow: ({ path }) => openFile(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)),
  } }, maxBytes === undefined ? {} : { maxBytes });
}
