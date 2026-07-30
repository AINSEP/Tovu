# Pipeline State — FEAT-037 Admin Frontend Mop-Up

- spec_provider: speckit (AI Dev Shop compatibility profile)
- provider_output_root: ADS-memory/specs/037-admin-frontend-mopup/
- spec_entrypoint_path: ADS-memory/specs/037-admin-frontend-mopup/feature.spec.md
- spec_mode: brownfield
- Follows the same lightweight local convention as SPEC-036 (single `feature.spec.md`, no full Speckit strict package) — user-confirmed for this batch of small items specifically.

## Routing

- Next: implementation, one subagent, one isolated worktree, sequential commits per item (Media → Taxonomy → Redirects → Collections → SEO).
- Red-Team / Software Architect / System Design stages: explicitly skipped, matching SPEC-036 precedent.
- Audit: deferred — user explicitly wants to batch SPEC-036 + SPEC-037 (+ possibly more) into one `/audit-work` round later, not audit per-item.
