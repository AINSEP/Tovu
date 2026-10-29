import { captureMediaUploaded } from "./analytics.js";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { requireInputRecord, requireString, ToolInputError, type ToolRegistration } from '@jini-ai/core';
import { adaptLegacyAuthorize, requireToolPermission } from '@jini-ai/cms/core';
import { MAX_DOCUMENT_BYTES, MediaValidationError, uploadMedia, documentContentType, documentDisplayFilename, type MediaToolDeps, type DocumentArchiveReaderPort } from '@jini-ai/cms/media';
import { refuseUnexpectedKeys } from '../../contracts/core/human-confirm.js';
import { toolMetadata } from '../../contracts/core/tool-metadata/media.js';
import { resolveChatAttachmentBytes, type ChatAttachmentLookup } from './promote-chat-attachment.js';

/** Host adapter shared by attachment, generated-text and file-copy saves; callers authorize media.upload.
 * Jini owns validation,
 * private blob ingestion and attribution; storage failures retain the normal redaction path.
 * @returns Private document metadata, never a public URL. @throws ToolInputError on policy refusal.
 * @complexity O(bytes) time/space, bounded by Jini's 10 MiB document policy.
 * @example await saveLibraryDocument({ deps, bytes, name: 'BRAND.md', principalId }, { archiveReader }); */
export async function saveLibraryDocument({ deps, bytes, name, principalId }: {
  deps: MediaToolDeps & { tracker?: Tracker }; bytes: Uint8Array; name: string; principalId: string;
}, { archiveReader }: { archiveReader?: DocumentArchiveReaderPort } = {}) {
  const { media } = await uploadMedia({ deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo,
    blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, documentArchiveReader: archiveReader },
    input: { workspaceId: deps.workspaceId, kind: 'document', bytes, filename: name,
      contentType: 'application/octet-stream', createdByPrincipal: principalId } }).catch(error => {
    // Input-policy refusals are recoverable; storage failures retain the normal redaction path.
    if (error instanceof MediaValidationError) throw new ToolInputError({ message: error.message });
    throw error;
  });
  captureMediaUploaded({ tracker: deps.tracker, actorId: principalId, byteLength: bytes.byteLength, kind: 'document', source: 'assistant' });
  return { document: { id: media.id, title: media.title, filename: documentDisplayFilename(media), originalFilename: media.originalFilename,
    contentType: documentContentType({ filename: name }), byteSize: bytes.byteLength, createdAt: media.createdAt,
    createdBy: media.createdBy ?? null, publicUrl: null } };
}

/** Decode only generated Markdown/plain text. Bound UTF-8 bytes before allocation; Jini's document
 * policy still validates the resulting bytes and plain filename before any write. @complexity O(bytes). */
function generatedDocument({ input }: { input: Record<string, unknown> }, _options = {}) {
  const name = requireString({ input, key: 'name' });
  const content = requireString({ input, key: 'content' });
  if (!/\.(md|txt)$/i.test(name)) throw new ToolInputError({ message: 'Generated documents need a .md or .txt name' });
  if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) throw new ToolInputError({ message: 'document must be non-empty and at most 10 MiB' });
  return { name, bytes: Buffer.from(content, 'utf8') };
}

/** Manual promotion uses the existing attachment resolver and media upload lifecycle. The refs
 * binding is server-owned: a model cannot nominate a stale upload, path, or another message's ref. */
export function buildLibrarySaveAttachmentTool(required: {
  deps: MediaToolDeps & { tracker?: Tracker };
  getStore: () => ChatAttachmentLookup | undefined;
  getMessageAttachmentRefs: (required: { runId: string }, optional: Record<string, never>) => readonly string[] | Promise<readonly string[]>;
  readFile: (path: string) => Promise<Uint8Array>;
  archiveReader: DocumentArchiveReaderPort;
}, _optional: Record<string, never> = {}): ToolRegistration {
  const { deps } = required;
  return {
    descriptor: {
      id: 'library_save_attachment', metadata: toolMetadata.library_save_attachment,
      description: 'Save a document to this site\'s private, assistant-only Library so it survives chat cleanup. Supply EITHER attachmentRef from this exact message (use chat_list_pending_attachments), OR name plus content for generated Markdown/plain text, e.g. {name:"BRAND.md",content:"# Brand\\n..."}. Generated text needs a .md/.txt plain filename and a non-empty UTF-8 body. Both modes cap at 10 MiB. Attachments accept .md, .txt, .pdf, .docx, .csv, .json, .doc, .xls, .rtf, .xlsx, .pptx, .pages, .key. For picked-folder/site documents use files_copy with destination:{kind:"library"}. Documents are never published; other attachments remain temporary.',
      inputSchema: { type: 'object', additionalProperties: false, oneOf: [
        { required: ['attachmentRef'], not: { anyOf: [{ required: ['name'] }, { required: ['content'] }] } },
        { required: ['name', 'content'], not: { required: ['attachmentRef'] } },
      ], properties: {
        attachmentRef: { type: 'string', minLength: 1, description: 'The attachment:<id> ref from this current message; paths and old-message refs are refused.' },
        name: { type: 'string', minLength: 1, maxLength: 255, description: 'Generated document filename, e.g. BRAND.md or notes.txt; no folder paths.' },
        content: { type: 'string', minLength: 1, maxLength: MAX_DOCUMENT_BYTES, description: 'Generated Markdown or plain text; at most 10 MiB encoded as UTF-8.' },
      } },
    },
    policy: { authorize: () => 'allow' },
    handler: async ctx => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'media.upload' }, { entityType: 'media' });
      const input = requireInputRecord({ input: ctx.input });
      refuseUnexpectedKeys(input, ['attachmentRef', 'name', 'content']);
      if (input.attachmentRef === undefined) return saveLibraryDocument({ deps, ...generatedDocument({ input }), principalId: ctx.principal.id }, { archiveReader: required.archiveReader });
      if (input.name !== undefined || input.content !== undefined) throw new ToolInputError({ message: 'Supply attachmentRef OR name and content, never both' });
      const ref = requireString({ input, key: 'attachmentRef' });
      const refs = await required.getMessageAttachmentRefs({ runId: ctx.run.id }, {});
      if (!ref.startsWith('attachment:') || !refs.includes(ref)) throw new ToolInputError({ message: 'attachment is not bound to this current message; attach it again' });
      const store = required.getStore();
      if (!store) throw new Error('attachment store is not ready');
      // resolveForRun still owns run isolation and integrity validation; membership alone never reads.
      const { bytes, name } = await resolveChatAttachmentBytes({ store, readFile: required.readFile }, { ref, runId: ctx.run.id });
      return saveLibraryDocument({ deps, bytes, name, principalId: ctx.principal.id }, { archiveReader: required.archiveReader });
    },
  };
}
