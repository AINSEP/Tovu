# Pipeline State — FEAT-039 Core Module Auth Relocation

- spec_provider: speckit (AI Dev Shop compatibility profile)
- provider_output_root: ADS-memory/specs/039-core-module-auth-relocation/
- spec_entrypoint_path: ADS-memory/specs/039-core-module-auth-relocation/feature.spec.md
- spec_mode: brownfield
- Follows the same lightweight local convention as SPEC-034/036/037/038.

## Routing

- Branch base: this branch forks from `feat-038-server-module-convention-third-slice` (not `main` directly) — it deepens the same `core.ts` module SPEC-038 left untouched, and building on top of SPEC-038's already-modularized `app.ts` avoids an unnecessary merge step between two Phase-3 slices that touch adjacent lines.
- Red-Team / Software Architect / System Design: skipped for the same reasons as SPEC-038, but this spec DOES record an explicit user design decision (absorb auth into core.ts vs. widen ServerModuleHandle) — that decision was made via direct user confirmation this session, not silently assumed.
- Audit: deferred, batching with SPEC-036/037/038 into one later `/audit-work` round per user's explicit preference.
