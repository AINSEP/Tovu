import { toolMetadata } from "../../contracts/core/tool-metadata/image-transform.js";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, withSchemaOnRejection, type AgentToolDefinition, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { ToolContributor } from "@jini-ai/core";
import { approvalToolHandler, refuseUnexpectedKeys } from "#src/contracts/core/human-confirm";
import { FS_FILES_READ_PERMISSION } from "../fs-files/agent-tools.js";
import { FsFilePathError } from "../fs-files/fs-files.js";
import { FsWriteInputError } from "../fs-files/write-files.js";
import { describeWriteBatch } from "../fs-files/tool-registrations.js";
import { ASSET_SOURCE_SCHEMA, readAssetSource } from "../asset-transfer/asset-sources.js";
import { requireAssetDestination, prepareAssetWrites, writeAssetFiles, type AssetToolDeps, type PreparedAssets } from "../asset-transfer/asset-destinations.js";
import { isShapeRejection as isThemeShapeRejection } from "../theme/asset-operations.js";
import { isImportShapeRejection } from "../media-import/tool-registrations.js";
import { ImageTransformError, OUTPUT_SCHEMA, IMAGE_LIMITS, inspectImage, normalizeOutputs, renderOutputs, type RenderedImage } from "./image-ops.js";

/**
 * @file `image_transform` — one parameterized tool for every resize/crop/convert job (owner
 * 2026-10-27: tools first, Bash/Python last; generic and flexible). Found live: an assistant
 * building a site generated favicon sizes with Python because no tool did it.
 *
 * Reuses, never re-implements: the source resolves through fs-files' roots and denylist
 * (`asset-sources.ts` + guarded reader); writes go through each destination's existing writer
 * and permission — the picked folder through `fs_write_files`' own batch rules and card, a theme
 * through `writeThemeBinaryFile` + reload, the media library through `uploadMedia`. Historically only the
 * picked folder asked (it leaves the site); theme and media writes are undoable edits. Site paths
 * now use that same batch approval because arbitrary site files lack a downstream validator.
 */

export const IMAGE_TRANSFORM_TOOL_ID = "image_transform";
export type ImageTransformToolDeps = AssetToolDeps & { imageCodec: import("@jini-ai/cms/media").ImageCodecPort };

const CATALOG: AgentToolDefinition = {
  name: IMAGE_TRANSFORM_TOOL_ID,
  description: "Resize, crop, rotate, flip and convert ONE image into up to 8 files (png, jpeg, webp, avif, ico) — use this instead of Python/ImageMagick. " +
    "Source: {root, path, themeId?}: site/picked paths, theme-relative assets or media id/slug. No outputs = inspect (width/height/format/bytes), writes nothing. " +
    "Destination: {kind:'site'} (paths relative to site) | {kind:'theme', themeId} | {kind:'media'} (not ico) | {kind:'picked'}. Site/picked writes use the fs_write_files batch approval. " +
    "Recipes — favicon set: [{path:'favicon.ico',format:'ico'},{path:'apple-touch-icon.png',format:'png',resize:{width:180,height:180,fit:'contain'}},{path:'icon-512.png',format:'png',resize:{width:512,height:512,fit:'contain'}}]; " +
    "social image: resize {width:1200,height:630,fit:'cover'}; thumbnail: resize {width:400,fit:'inside'}; to webp: {format:'webp',quality:80}. " +
    `Caps: ${IMAGE_LIMITS.maxDimension}px per side, ${IMAGE_LIMITS.maxInputPixels / 1e6} MP and ${IMAGE_LIMITS.maxSourceBytes / 1024 / 1024} MiB source. Metadata is stripped unless stripMetadata: false.`,
  sideEffects: "mutates-durable-state",
  authorization: { permission: FS_FILES_READ_PERMISSION },
  inputSchema: { type: "object", additionalProperties: false, required: ["source"], properties: {
    source: ASSET_SOURCE_SCHEMA,
    outputs: { type: "array", minItems: 1, maxItems: IMAGE_LIMITS.maxOutputs, items: OUTPUT_SCHEMA },
    destination: { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { type: "string", enum: ["site", "theme", "media", "picked"] }, themeId: { type: "string", minLength: 1 } } },
  } },
};
export const imageTransformAgentToolCatalog: AgentToolDefinition[] = [CATALOG];
const CATALOG_BY_ID = indexCatalogById({ catalog: imageTransformAgentToolCatalog });

/** -> guarded read + in-memory render; then a theme file, a media item or (carded) picked-folder files. */
export const imageTransformDerivedRisk: DerivedRiskByToolId = new Map([[IMAGE_TRANSFORM_TOOL_ID, "mutates-durable-state"]]);

interface Prepared { source: Awaited<ReturnType<typeof inspectImage>>; rendered: RenderedImage[]; assets?: PreparedAssets }
const isCallerError = (error: unknown) => {
  if (error instanceof ImageTransformError || error instanceof FsFilePathError || error instanceof FsWriteInputError) return true;
  return isThemeShapeRejection(error) || isImportShapeRejection({ error });
};
const view = (rendered: readonly RenderedImage[]) => rendered.map(({ path, format, width, height, bytes }) => ({ path, format, width, height, bytes: bytes.length }));

/** Validate and authorize before I/O; all outputs render before any approval or destination write.
 * @throws Input, permission, decode and writer refusals. @complexity O(outputs × pixels), bounded. */
async function prepare({ routeDeps, ctx }: { routeDeps: ImageTransformToolDeps; ctx: Parameters<import("@jini-ai/core").ToolHandler>[0] }): Promise<Prepared> {
  const input = requireInputRecord({ input: ctx.input });
  refuseUnexpectedKeys(input, ["source", "outputs", "destination"]);
  const outputs = input.outputs === undefined ? undefined : normalizeOutputs({ outputs: input.outputs });
  // An inspect needs no destination; it cannot reach a writer.
  const destination = outputs ? await requireAssetDestination({ deps: routeDeps, ctx, input: input.destination }) : undefined;
  const { bytes } = await readAssetSource({ deps: routeDeps, ctx, input: input.source, maxBytes: IMAGE_LIMITS.maxSourceBytes });
  const prepared: Prepared = { source: await inspectImage({ source: bytes, imageCodec: routeDeps.imageCodec }), rendered: outputs ? await renderOutputs({ source: bytes, outputs, imageCodec: routeDeps.imageCodec }) : [] };
  if (destination) prepared.assets = prepareAssetWrites({ deps: routeDeps, destination, files: prepared.rendered });
  return prepared;
}

export function buildImageTransformRegistrations(routeDeps: ImageTransformToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handler = approvalToolHandler<Prepared>({ surfaces,
    prepare: ({ ctx }) => withSchemaOnRejection({ toolId: IMAGE_TRANSFORM_TOOL_ID, catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isCallerError(error), fn: () => prepare({ routeDeps, ctx }) }),
    describe: ({ prepared }) => describeWriteBatch(prepared.assets?.batch ?? { folder: "", writes: [] }, { toolId: IMAGE_TRANSFORM_TOOL_ID }),
    run: async ({ ctx, prepared }) => {
      const base = { source: prepared.source, outputs: view(prepared.rendered) };
      if (!prepared.assets) return { applied: false, ...base };
      const outcome = await writeAssetFiles({ deps: routeDeps, ctx, prepared: prepared.assets }) as { failed?: unknown };
      return { applied: outcome.failed === undefined, ...base, ...outcome };
    },
  }, { flag: "applied", ask: ({ prepared }) => prepared.assets?.batch !== undefined });
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "image-transform", catalogModule: "features/image-transform/tool.ts",
    catalog: CATALOG_BY_ID, handlers: { [IMAGE_TRANSFORM_TOOL_ID]: handler }, derivedRisk: imageTransformDerivedRisk });
}

/** Contributes `image_transform` — registered once by `tool-catalog-manifest.ts`. */
export function contributeImageTransformTools(): ToolContributor<ImageTransformToolDeps, AssistantSurfaceDeps> {
  return { domain: "image-transform", build: buildImageTransformRegistrations, risk: imageTransformDerivedRisk };
}
