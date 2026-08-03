/**
 * @file Core port contracts — re-exported from `@jini-ai/cms/core`.
 *
 * These contracts were defined here until 2026-08-02 and now live in the package, so a second host
 * (which does not have this repo's `src/`) can depend on the same interfaces.
 *
 * This file stays as a re-export rather than being deleted because **164 files import
 * `../core/ports`**. Rewriting all of them is a mechanical change that deserves its own commit and
 * review; folding it into the extraction would have buried a boundary change under ~200 unrelated
 * import edits.
 *
 * There is exactly one definition of each of these and this module owns none of them. Do not add a
 * type here — put it in `@jini-ai/cms/core` if it is generic, or in the module that needs it if it
 * is not. A locally defined type sitting among these re-exports would be indistinguishable from a
 * ported one at every call site, and would silently stop being shared the moment a second host
 * adopted the package.
 */
export type {
  UUID,
  ISODateTime,
  JsonPrimitive,
  JsonValue,
  JsonObject,
  JsonArray,
  DomainEvent,
  EventBusPort,
  OutboxRecord,
  OutboxPort,
  ClockPort,
  IdGeneratorPort,
} from "@jini-ai/cms/core";
