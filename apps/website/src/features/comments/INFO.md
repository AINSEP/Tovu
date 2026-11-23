# comments (host feature folder)
## Wiring

- The comments data-module declaration and its boot install live in `@jini-ai/cms/comments/site/types`
  and `@jini-ai/cms/comments/site/data-module-install`. This host owns the declaration provenance
  (`COMMENTS_DATA_MODULE_PROVENANCE` in `server/runtime/composition/data-modules.ts`, publisher identity)
  and passes it to both `commentsDataModule` and `installCommentsDataModule`, with its data-module
  store and content database path.
