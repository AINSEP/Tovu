/**
 * @file In-memory adapters for the taxonomy write/list ports — re-exported from
 * `@jini-ai/cms/taxonomy`.
 *
 * These are library code, not host code: they implement the same ports any host implements and
 * back them with a `Map` instead of a database, so a consumer of the package can exercise the
 * domain without standing up storage. `server/app.ts` uses them for its in-memory mode.
 */
export {
  InMemoryTaxonomyRepo,
  InMemoryTermRepo,
  InMemoryEntryTermRepo,
  InMemoryTaxonomyRevisionRepo,
  InMemoryContentLookup,
  noopStampWatermark,
  toTaxonomyOutbox,
} from "@jini-ai/cms/taxonomy";
