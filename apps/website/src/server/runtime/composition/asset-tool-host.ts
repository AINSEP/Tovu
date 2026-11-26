/**
 * Binds the theme owner's write policy and the media Library saver into the asset tools' host port
 * (files_copy, image_transform), so those features never import theme or media implementations.
 */
import type { AssetTheme } from '@jini-ai/core/contracts/site/asset-transfer-tool-ports';
import type { AssetHostPort, AssetToolDeps } from '#src/features/asset-transfer/asset-sources';
import { persistImportedMedia, isImportShapeRejection, withCallerSafeEgressRefusal } from '#src/features/media-import/tool-registrations';
import { fetchImage, validateImageBytes, MEDIA_IMPORT_POLICY } from '#src/features/media-import/fetch-image';
import { adaptLegacyAuthorize } from '@jini-ai/cms/core';
import { refuseUnexpectedKeys } from '#src/contracts/core/human-confirm';
import type { AssetDestinationDeps } from '@jini-ai/cms/asset-transfer/asset-destinations';
import type { FilesCopyToolDeps } from '@jini-ai/cms/asset-transfer/copy-tool';
import { inspectWriteTarget, prepareFileWrites, writePreparedFiles, FsWriteInputError } from '@jini-ai/cms/fs-files/write-files';
import { preparePickedFolderBatch } from '#src/features/fs-files/tool-registrations';
import { resolveFsFilePath, listFsFiles } from '#src/features/fs-files/fs-files';
import { readAssetSource, resolveAssetSource, readLocalFile } from '#src/features/asset-transfer/asset-sources';
import { nextAvailableFileName } from '@jini-ai/cms/themes/files/moves';
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from '@jini-ai/cms/fs-files/custom-root-permission';
import { FsFilePathError } from '@jini-ai/platform/fs/guarded-reader';
import { MAX_DOCUMENT_BYTES, validateDocumentIngress, MediaValidationError } from '@jini-ai/cms/media';
import { createDocumentArchiveReader } from '@jini-ai/cms/media/site/document-archive';
import * as yauzl from 'yauzl';
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from '@jini-ai/agent-plugins/lifecycle/yauzl';
import { assertThemeFileWritable, findThemeOrThrow, isShapeRejection, reloadThemeInPlace, resolveThemeFilePath, sniffThemeImportType, THEME_IMPORT_ACCEPT, THEME_IMPORT_POLICY, THEME_WRITE_PERMISSION, writeThemeBinaryFile, type ThemeToolDeps } from "#src/features/theme/asset-operations";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { saveLibraryDocument } from "@jini-ai/cms/media/site/library-save-attachment";

/** What the host binding reads: the asset tools' own deps plus the theme roster they write into. */
export type AssetHostDeps = Omit<AssetToolDeps, "resolveImportedMediaUrls" | "assetHost"> & ThemeToolDeps;

/** One asset-tool call's host port over `deps`. @complexity O(1) binding; each method as its owner. */
export function bindAssetHost(deps: AssetHostDeps, _optional = {}): AssetHostPort<DiscoveredTheme> {
  return {
    themeWritePermission: THEME_WRITE_PERMISSION,
    findTheme: ({ themeId }) => findThemeOrThrow({ routeDeps: deps, themeId }),
    checkThemeWrite: ({ theme, relativePath }) => {
      assertThemeFileWritable({ theme, relativePath });
      resolveThemeFilePath({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath });
    },
    writeThemeFile: ({ theme, relativePath, bytes }) => writeThemeBinaryFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath, bytes }),
    reloadTheme: ({ theme, themeId }) => reloadThemeInPlace({ routeDeps: deps, theme, themeId }),
    sniffThemeImportType: ({ bytes }) => sniffThemeImportType({ bytes }),
    themeImportFetch: { policy: THEME_IMPORT_POLICY, accept: THEME_IMPORT_ACCEPT },
    isThemeShapeRejection: ({ error }) => isShapeRejection({ error }),
    saveLibraryDocument: (required, optional) => saveLibraryDocument({ deps, ...required }, optional),
  };
}

export function bindAssetDestinationDeps(required: { deps: AssetToolDeps }, _optional = {}): AssetDestinationDeps<AssetTheme> {
  const { deps } = required;
  return {
    authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, refuseUnexpectedKeys,
    permissions: { site: FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION, picked: FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION,
      theme: deps.assetHost.themeWritePermission, media: 'media.upload', library: 'media.upload' },
    fs: {
      siteFolder: () => deps.siteBinding.dir,
      inspect: input => inspectWriteTarget({ ...input, resolveFsFilePath }),
      prepareSite: ({ folder, files }) => ({ folder, writes: prepareFileWrites({ folder, files, resolveFsFilePath }) }),
      preparePicked: ({ files }) => preparePickedFolderBatch({ routeDeps: deps, files }),
      writePrepared: input => writePreparedFiles({ ...input, resolveFsFilePath }),
      chooseNextName: input => nextAvailableFileName(input),
    },
    theme: deps.assetHost,
    media: { validateBytes: input => validateImageBytes(input), persist: input => persistImportedMedia({ routeDeps: deps,
      resolvePublicUrls: deps.resolveImportedMediaUrls, ...input }) },
    library: { saveDocument: input => deps.assetHost.saveLibraryDocument(input, { archiveReader: deps.documentArchiveReader }) },
  };
}

/** Host binding: the installed yauzl SDK + agent-plugins streaming reader back the document archive guard. */
const documentArchiveDeps = { yauzl: yauzl as unknown as YauzlPort, createArchiveReader: createYauzlAgentPluginArchiveReader };

export function bindFilesCopyToolDeps(required: { deps: AssetToolDeps }, _optional = {}): FilesCopyToolDeps<AssetTheme> {
  const deps = { ...required.deps, documentArchiveReader: required.deps.documentArchiveReader ?? createDocumentArchiveReader(documentArchiveDeps) };
  return {
    destination: bindAssetDestinationDeps({ deps }), refuseUnexpectedKeys,
    source: {
      readAsset: input => readAssetSource({ deps, ...input }), resolveFolder: input => resolveAssetSource({ deps, ...input }),
      list: input => listFsFiles(input), readFile: input => readLocalFile(input),
      fetchUrl: ({ url, media, maxBytes }) => withCallerSafeEgressRefusal({ log: deps.mediaImportEgressRefusalLog ?? console.warn,
        work: () => fetchImage({ deps: { httpClient: deps.mediaImportHttpClient, plainHttpTestOrigins: deps.outboundTestOrigins }, url },
          media ? { policy: { ...MEDIA_IMPORT_POLICY, maxBytes } } : deps.assetHost.themeImportFetch) }, { toolId: 'files_copy' }),
    },
    documentArchiveReader: deps.documentArchiveReader, documents: { maxBytes: MAX_DOCUMENT_BYTES, validate: (input, options) => validateDocumentIngress(input, options) },
    isFsShapeRejection: ({ error }) => error instanceof FsFilePathError || error instanceof FsWriteInputError,
    isDocumentShapeRejection: ({ error }) => error instanceof MediaValidationError,
    isThemeShapeRejection: input => deps.assetHost.isThemeShapeRejection(input), isImportShapeRejection,
  };
}
