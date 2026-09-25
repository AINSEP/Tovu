/**
 * @file Entries' agent-tool registrations — re-exported from `@jini-ai/cms/entries`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/` and
 * `navigation/`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains as a
 * single uniform block of `../<domain>/tool-registrations` lines. Pointing only entries somewhere
 * else would make the ported domain the odd line out, and would invite the next reader to "restore
 * consistency" by reaching past a barrel rather than through it. When more domains move, this file
 * and its siblings retire together.
 *
 * 2026-08-17 (Stage 2 batch 2 of the registry rollout): converted to
 * `assistant/tool-contribution-registry.ts`'s explicit-call registry, same as `widgets`/
 * `content-types`/`forms`/`menus`/`recovery`/`plugins` earlier in this batch — see that file's
 * header for why. Converted LAST in this batch, deliberately: `widgets` (converted first, domain #1
 * in this batch) imports `features/entries` internally
 * (`region-area-service.ts`/`read-service.ts`/`embed-service.ts`/`entry-payload.ts`/`deps.ts`/
 * `resolver-service.ts`/`write-service.ts`/`resolvers/{recent-entries,create-core-resolvers}.ts`),
 * so — same reasoning as `content-types`/`forms` — this could only convert safely once `widgets` was
 * already off the static `DOMAIN_SLICES` array. `comments` also imports `features/entries`
 * (`comments/index.ts`), but `comments` was already registry-converted in Stage 1, so that edge was
 * never a risk.
 */
import type { ToolContributor } from "#src/assistant/index";
import {
  buildEntriesRegistrations,
  entriesDerivedRisk,
  ContentTypeNotActiveError,
  ContentTypeNotFoundError,
  EntryNotFoundError,
  EntrySlugConflictError,
  ForbiddenError as EntriesForbiddenError,
  VersionConflictError,
  type EntriesToolDeps,
} from "@jini-ai/cms/entries";

import { forbiddenRule, withModelFacingRegistrationErrors, type ModelFacingErrorRule } from "../../contracts/core/model-facing-tool-errors.js";

export { buildEntriesRegistrations, entriesDerivedRisk, type EntriesToolDeps };

/**
 * Entries' model-facing allowlist (2026-09-24). `write-service.ts` throws these five domain classes
 * plus the entries package's OWN `ForbiddenError` from fixed text plus caller-supplied ids/slugs/
 * versions only (verified against every `new X(...)` call site) — none carries a stack trace, a
 * filesystem path, or another tenant's data, so every one is safe to publish verbatim. `VersionConflictError`
 * gets guidance because "expected version N, found M" alone does not tell a caller what to do next.
 * `forbiddenRule("ENTRIES")` covers the KIT's `ForbiddenError` (`requireToolPermission`, thrown before
 * any of these domain checks run) — a distinct class from the entries package's own.
 */
const ENTRIES_MODEL_FACING_RULES: readonly ModelFacingErrorRule[] = [
  { error: EntriesForbiddenError, code: "ENTRIES_FORBIDDEN" },
  { error: EntryNotFoundError, code: "ENTRIES_NOT_FOUND" },
  { error: ContentTypeNotFoundError, code: "ENTRIES_CONTENT_TYPE_NOT_FOUND" },
  { error: ContentTypeNotActiveError, code: "ENTRIES_CONTENT_TYPE_NOT_ACTIVE" },
  { error: EntrySlugConflictError, code: "ENTRIES_SLUG_CONFLICT" },
  {
    error: VersionConflictError,
    code: "ENTRIES_VERSION_CONFLICT",
    guidance: "Re-read the entry and retry with its current version.",
  },
  forbiddenRule("ENTRIES"),
];

/**
 * Contributes Entries' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildEntriesRegistrations`/
 * `entriesDerivedRisk` by name; this is the seam that replaced it.
 *
 * `build` wraps every registration with {@link withModelFacingRegistrationErrors} (2026-09-24): Jini's
 * `ToolExecutor` classifies any rejection that is not `instanceof ToolInputError` as `'internal'`, and
 * every one of entries' own domain errors still extends plain `Error` (unlike `content-types`', which
 * were fixed at the source — see `contracts/core/model-facing-tool-errors.ts`'s header), so without
 * this wrap every entries failure reached the model as a redacted `INTERNAL_ERROR` 500.
 */
export function contributeEntriesTools(): ToolContributor {
  return {
    domain: "entries",
    build: (deps) => withModelFacingRegistrationErrors(buildEntriesRegistrations(deps), ENTRIES_MODEL_FACING_RULES),
    risk: entriesDerivedRisk,
  };
}
