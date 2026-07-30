# Pipeline State — FEAT-038 Server Module Convention Third Slice

- spec_provider: speckit (AI Dev Shop compatibility profile)
- provider_output_root: ADS-memory/specs/038-server-module-convention-third-slice/
- spec_entrypoint_path: ADS-memory/specs/038-server-module-convention-third-slice/feature.spec.md
- spec_mode: brownfield
- Follows the same lightweight local convention as SPEC-034/036/037.

## Routing

- Next: implementation, one subagent, one isolated worktree (per ADR-046's own worktree-isolation mandate).
- Red-Team / Software Architect / System Design: skipped — this is a pure mechanical continuation of an already-Accepted architecture (ADR-046), no new architectural decision made in this spec.
- Audit: deferred, batching with SPEC-036/037 into one later `/audit-work` round per user's explicit preference.
- Explicitly out of scope: `requireAdminSession`/`registerAuthRoutes` relocation — raised to the user as a separate decision point, not part of this spec.
