/**
 * @file Media's agent-tool registrations — re-exported from `@jini-ai/cms/media`.
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports every not-yet-converted domain as a single uniform block
 * of `../<domain>/tool-registrations` lines. Pointing only media somewhere else would make the one
 * ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 *
 * Converted to the tool-contribution registry 2026-08-17, on a RETRY: first tried in Stage 2 batch 2
 * and reverted the same session. At that time, a plain importer grep of this file itself found
 * nothing risky (only `assistant/tool-registrations.ts`), but `check:architecture`'s module graph is
 * per-directory: `src/widgets/resolver-service.ts` value-imports `CORE_PUBLIC_TRANSFORM_NAME` from
 * `../media/bootstrap` and `getLatestTransformDefinition` from `../media/index`, and `assistant`
 * still statically depended on `widgets` (`assistant/tool-registrations.ts`'s own `DOMAIN_SLICES`)
 * at the time — group B ran the `media` conversion attempt in its own isolated worktree, before
 * group A's separate, parallel `widgets` conversion had merged. Adding a `media -> assistant`
 * registry edge back then closed a real 3-module cycle: `assistant, media, widgets` (confirmed via
 * `check:architecture --list`: largest strongly-connected component, runtime-only, went 0 -> 3).
 *
 * Re-verified this session, after both batches had merged into `general-work`: `widgets` is now
 * converted too (`widgets/tool-registrations.ts`'s own `contributeWidgetsTools()`), which already
 * removed the `assistant -> widgets` static edge that closed the cycle above. `resolver-service.ts`'s
 * value-imports into `media/bootstrap`/`media/index` are unchanged and still exist, but with
 * `assistant` no longer reaching `widgets` statically, they no longer round-trip back to `assistant`.
 * `check:architecture` confirms 0 module cycles with this conversion in place — see this repo's own
 * commit history for the before/after run in the same worktree.
 */
import { registerToolContributor } from "#src/assistant/index";
import { buildMediaRegistrations, mediaDerivedRisk, type MediaToolDeps } from "@jini-ai/cms/media";

export { buildMediaRegistrations, mediaDerivedRisk, type MediaToolDeps };

/**
 * Contributes Media's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildMediaRegistrations`/
 * `mediaDerivedRisk` by name (only `MediaToolDeps` as an erased `import type`); this is the seam that
 * replaced it — see this file's own header above for why the earlier attempt closed a cycle and why
 * this retry does not.
 */
export function contributeMediaTools(): void {
  registerToolContributor({ domain: "media", build: buildMediaRegistrations, risk: mediaDerivedRisk });
}
