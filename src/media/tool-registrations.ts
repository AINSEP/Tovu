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
 * NOT converted to the tool-contribution registry — tried in Stage 2 batch 2 and reverted the same
 * session. A plain importer grep of this file itself finds nothing risky (only
 * `assistant/tool-registrations.ts`), but `check:architecture`'s module graph is per-directory:
 * `src/widgets/resolver-service.ts` value-imports `CORE_PUBLIC_TRANSFORM_NAME` from
 * `../media/bootstrap` and `getLatestTransformDefinition` from `../media/index`, and `assistant`
 * still statically depends on `widgets` (`assistant/tool-registrations.ts`'s own `DOMAIN_SLICES`).
 * Adding a `media -> assistant` registry edge here closed a real 3-module cycle:
 * `assistant, media, widgets` (confirmed via `check:architecture --list`: largest
 * strongly-connected component, runtime-only, went 0 -> 3). Safe conversion needs either
 * `resolver-service.ts`'s media read relocated behind a narrower port, or `widgets` converted first
 * (removing `assistant`'s static edge into it) — neither attempted here; reverted cleanly instead,
 * mirroring `features/source-control/tool-registrations.ts`'s own revert comment for the same shape
 * of problem.
 */
export { buildMediaRegistrations, mediaDerivedRisk, type MediaToolDeps } from "@jini-ai/cms/media";
