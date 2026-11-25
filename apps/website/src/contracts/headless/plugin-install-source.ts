export const PLUGIN_INSTALL_SOURCE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["kind"],
  oneOf: [{ required: ["path"], not: { required: ["attachmentRef"] } }, { required: ["attachmentRef"], not: { required: ["path"] }, properties: { kind: { const: "zip" } } }],
  properties: {
    kind: { type: "string", enum: ["folder", "zip"], description: "folder for an unpacked package; zip for a local ZIP or chat attachment." },
    path: { type: "string", minLength: 1, description: "Absolute path on the machine Tovu runs on. Exactly one of path/attachmentRef." },
    attachmentRef: { type: "string", pattern: "^attachment:[A-Za-z0-9-]{8,80}$", description: "Opaque attachment:<uuid> for a file on this message: copy it from chat_list_pending_attachments. Not derivable from the file's disk path or folder. ZIP only; exactly one of path/attachmentRef." },
  },
} as const;
