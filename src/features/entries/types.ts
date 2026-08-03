/**
 * @file Entries' domain vocabulary — re-exported from `@jini-ai/cms/entries`.
 *
 * Only `src/widgets/` still imports this path directly, and that module is being ported by
 * separate work in flight, so its imports must not be touched here. When that lands, this shim
 * retires and widgets reaches the domain through `./index.ts` like every other consumer.
 */
export type {
  EntryStatus,
  EntryFieldsJson,
  EntryRecord,
  OwningContentType,
  ActorIdentityInput,
  Result,
} from "@jini-ai/cms/entries";
