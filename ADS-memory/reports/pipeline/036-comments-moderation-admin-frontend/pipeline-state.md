# Pipeline State — FEAT-036 Comments Moderation Admin Frontend

- spec_provider: speckit (AI Dev Shop compatibility profile)
- provider_native_root: specs/
- provider_output_root: ADS-memory/specs/036-comments-moderation-admin-frontend/
- spec_entrypoint_path: ADS-memory/specs/036-comments-moderation-admin-frontend/feature.spec.md
- spec_readiness_artifact: feature.spec.md (APPROVED status set inline per this repo's established lightweight local convention — see note below)
- spec_hash: not computed — validator not run, see note
- spec_mode: brownfield

## Local convention note

This repo's last 3 specs (SPEC-033, SPEC-034, SPEC-035) all shipped as a single `feature.spec.md` file, skipping the full 10-file Speckit strict package (`api.spec.md`/`state.spec.md`/`traceability.spec.md`/`spec-manifest.md`/`spec-dod.md`/etc.) and the mechanical hash validator. This spec follows that same established local practice rather than the framework's documented full package, per the user's explicit scope request this session ("spec first, then build, then /audit-work" — the lightweight version, matching actual recent precedent, not the full Red-Team/Software-Architect/System-Design pipeline ceremony).

## Routing

- Next: implementation (dispatched to a subagent in an isolated git worktree, per ADR-046's own worktree-isolation mandate for this kind of concurrent-edit-risk work), then `/audit-work`.
- Red-Team / Software Architect / System Design stages: explicitly skipped, matching SPEC-033/034/035 precedent and this session's user-confirmed scope.
