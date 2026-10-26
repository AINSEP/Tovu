import { captureMediaUploaded } from "./analytics.js";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { requireInputRecord, requireString, ToolInputError, type ToolRegistration } from '@jini-ai/core';
import { adaptLegacyAuthorize, requireToolPermission } from '@jini-ai/cms/core';
import { MediaValidationError, uploadMedia, documentContentType, documentDisplayFilename, type MediaToolDeps, type DocumentArchiveReaderPort } from '@jini-ai/cms/media';
import { toolMetadata } from '../../contracts/core/tool-metadata/media.js';
import { resolveChatAttachmentBytes, type ChatAttachmentLookup } from './promote-chat-attachment.js';

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
      description: 'Explicitly saves a document attached to this exact message into this site\'s private Library so it survives chat cleanup. Use chat_list_pending_attachments to obtain attachmentRef. Accepts .md, .txt, .pdf, .docx, .csv, .json, .doc, .xls, .rtf, .xlsx, .pptx, .pages, .key up to 10 MiB. Office/iWork/RTF documents support download only. Other attachments remain temporary.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['attachmentRef'], properties: {
        attachmentRef: { type: 'string', minLength: 1, description: 'The attachment:<id> ref from this current message; paths and old-message refs are refused.' },
      } },
    },
    policy: { authorize: () => 'allow' },
    handler: async ctx => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'media.upload' }, { entityType: 'media' });
      const ref = requireString({ input: requireInputRecord({ input: ctx.input }), key: 'attachmentRef' });
      const refs = await required.getMessageAttachmentRefs({ runId: ctx.run.id }, {});
      if (!ref.startsWith('attachment:') || !refs.includes(ref)) throw new ToolInputError({ message: 'attachment is not bound to this current message; attach it again' });
      const store = required.getStore();
      if (!store) throw new Error('attachment store is not ready');
      // resolveForRun still owns run isolation and integrity validation; membership alone never reads.
      const { bytes, name } = await resolveChatAttachmentBytes({ store, readFile: required.readFile }, { ref, runId: ctx.run.id });
      const { media } = await uploadMedia({ deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo,
        blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, documentArchiveReader: required.archiveReader },
        input: { workspaceId: deps.workspaceId, kind: 'document', bytes, filename: name,
          contentType: "application/octet-stream", createdByPrincipal: ctx.principal.id } }).catch(error => {
        // Input-policy refusals are recoverable; storage failures retain the normal redaction path.
        if (error instanceof MediaValidationError) throw new ToolInputError({ message: error.message });
        throw error;
      });
      captureMediaUploaded({ tracker: deps.tracker, actorId: ctx.principal.id, byteLength: bytes.byteLength, kind: "document", source: "assistant" });
      return { document: { id: media.id, title: media.title, filename: documentDisplayFilename(media), originalFilename: media.originalFilename,
        contentType: documentContentType({ filename: name }), byteSize: bytes.byteLength, createdAt: media.createdAt,
        createdBy: media.createdBy ?? null, publicUrl: null } };
    },
  };
}
