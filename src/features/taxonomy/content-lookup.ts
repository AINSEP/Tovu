/**
 * @file The `ContentLookupPort` adapter backed by this host's posts table — re-exported from
 * `@jini-ai/cms/taxonomy`.
 *
 * The package's version declares its dependency structurally, as `ContentRecordLookupPort`: a
 * single `findById` returning `{workspaceId, kind}`. This host's `PostRepoPort` satisfies that
 * shape as-is, so every existing call site still passes `routeDeps.postRepo` unchanged and nothing
 * needs to implement a new interface.
 *
 * That narrowing is the reason taxonomy could be extracted at all. This file previously imported
 * `PostRepoPort` from `features/post`, and `tool-registrations.ts` imported the same type through
 * that feature's BARREL — which also re-exports `repo.sqlite.ts` and `search-index.sqlite.ts`, both
 * of which reach `db/schema.ts`. One type import through a barrel therefore put a whole content
 * feature and this repo's shared schema into taxonomy's dependency closure, to obtain a signature
 * whose only used method takes two fields off one row.
 */
export { createPostBackedContentLookup } from "@jini-ai/cms/taxonomy";

export type { ContentRecordLookupPort } from "@jini-ai/cms/taxonomy";
