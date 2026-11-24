# image-transform

`tool.ts` registers the `image_transform` agent tool: the image operations live in
`@jini-ai/cms/media/site-transform/image-ops`; this file composes them with Tovu's asset-transfer
sources/destinations, the fs-files approval card and human-confirm.

## Wiring

- The image codec is injected as `routeDeps.imageCodec` (`ImageTransformToolDeps`), bound by
  `server/runtime/composition/tool-catalog-manifest.ts` via `contributeImageTransformTools()`.
- `FsWriteInputError` comes from `@jini-ai/cms/fs-files/write-files`; writes go through
  `asset-transfer/asset-destinations.ts`, which binds `fs-files.ts`'s `resolveFsFilePath`.
