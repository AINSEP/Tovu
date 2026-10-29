import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ToolInputError, requireInputRecord } from "@jini-ai/core";
import { CHAT_ATTACHMENT_REF_PATTERN, type ChatAttachmentReadResult } from "./chat-attachment.js";

/** Host-owned byte access: composition scopes opaque refs by principal and accepted message/run. */
export type InstallAttachmentReader = (
  required: { ref: string; ownerId: string; runId: string },
  optional: { maxBytes: number },
) => Promise<ChatAttachmentReadResult>;

export const PLUGIN_INSTALL_SOURCE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["kind"],
  oneOf: [{ required: ["path"], not: { required: ["attachmentRef"] } }, { required: ["attachmentRef"], not: { required: ["path"] }, properties: { kind: { const: "zip" } } }],
  properties: {
    kind: { type: "string", enum: ["folder", "zip"], description: "folder for an unpacked package; zip for a local ZIP or chat attachment." },
    path: { type: "string", minLength: 1, description: "Absolute path on the machine Tovu runs on. Exactly one of path/attachmentRef." },
    attachmentRef: { type: "string", pattern: "^attachment:[A-Za-z0-9-]{8,80}$", description: "Opaque attachment:<uuid> for a file on this message: copy it from chat_list_pending_attachments. Not derivable from the file's disk path or folder. ZIP only; exactly one of path/attachmentRef." },
  },
} as const;

export interface PluginInstallRequest { readonly kind: "folder" | "zip"; readonly path?: string; readonly attachmentRef?: string; readonly replace: boolean }

export interface InstallArchiveFiles {
  stat(required: { path: string }, optional?: Record<string, never>): Promise<{ size: number }>;
  read(required: { path: string }, optional?: Record<string, never>): Promise<Uint8Array>;
}

const nodeArchiveFiles: InstallArchiveFiles = {
  stat: ({ path: sourcePath }, _optional) => stat(sourcePath),
  read: ({ path: sourcePath }, _optional) => readFile(sourcePath),
};

export function readPluginInstallRequest(
  { input: rawInput }: { input: unknown },
  _optional: Record<string, never> = {},
): PluginInstallRequest {
  const input = requireInputRecord({ input: rawInput });
  if (!input.source || typeof input.source !== "object" || Array.isArray(input.source)) throw new ToolInputError({ message: "source is required." });
  const source = input.source as Record<string, unknown>;
  const { kind, path: sourcePath, attachmentRef } = source;
  if (kind !== "folder" && kind !== "zip") throw new ToolInputError({ message: "source.kind must be 'folder' or 'zip'." });
  validateInstallLocation({ source, kind, sourcePath, attachmentRef });
  if (input.replace !== undefined && typeof input.replace !== "boolean") throw new ToolInputError({ message: "replace must be a boolean." });
  return { kind, ...(typeof sourcePath === "string" ? { path: sourcePath } : { attachmentRef: attachmentRef as string }), replace: input.replace === true };
}

/** Bound reads BEFORE allocation; never interpret an opaque attachment id as a filesystem path. */
export async function readPluginInstallArchive(
  required: { request: PluginInstallRequest; ownerId: string; runId: string; maxBytes: number },
  optional: { readAttachment?: InstallAttachmentReader; files?: InstallArchiveFiles } = {},
): Promise<Uint8Array> {
  const { request, ownerId, runId, maxBytes } = required;
  if (request.attachmentRef) {
    const result = await optional.readAttachment?.({ ref: request.attachmentRef, ownerId, runId }, { maxBytes });
    if (!result?.ok) throw new ToolInputError({ message: "Chat ZIP attachment is unavailable or exceeds the 32 MiB upload limit. Use an attachmentRef listed by chat_list_pending_attachments." });
    requireArchiveSize({ size: result.bytes.byteLength, maxBytes });
    return result.bytes;
  }
  const sourcePath = request.path!;
  const files = optional.files ?? nodeArchiveFiles;
  let size: number;
  try { size = (await files.stat({ path: sourcePath })).size; } catch { throw new ToolInputError({ message: `No readable ZIP at ${sourcePath}.` }); }
  requireArchiveSize({ size, maxBytes });
  const bytes = await files.read({ path: sourcePath });
  // Re-check in case the local file grew between stat and read.
  requireArchiveSize({ size: bytes.byteLength, maxBytes });
  return bytes;
}

function validateInstallLocation(
  { source, kind, sourcePath, attachmentRef }: { source: Record<string, unknown>; kind: "folder" | "zip"; sourcePath: unknown; attachmentRef: unknown },
  _optional: Record<string, never> = {},
): void {
  if (Object.hasOwn(source, "path") === Object.hasOwn(source, "attachmentRef")) throw new ToolInputError({ message: "Exactly one of source.path/source.attachmentRef is required." });
  if (Object.hasOwn(source, "attachmentRef")) {
    if (kind !== "zip" || typeof attachmentRef !== "string" || !CHAT_ATTACHMENT_REF_PATTERN.test(attachmentRef)) throw new ToolInputError({ message: "source.attachmentRef must be an attachment:<uuid> ZIP reference." });
  } else {
    if (typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)) throw new ToolInputError({ message: "source.path must be an absolute path on the machine Tovu runs on (expand ~ first)." });
  }
}

function requireArchiveSize({ size, maxBytes }: { size: number; maxBytes: number }, _optional: Record<string, never> = {}): void {
  if (size > maxBytes) throw new ToolInputError({ message: "ZIP exceeds the 32 MiB upload limit." });
}
