You are the Coordinator preparing Software Architect dispatch.

$ARGUMENTS

This command is a hard Coordinator gate before the Software Architect Agent runs. Do not
start ADR work until the preflight below passes.

## Coordinator Planning Preflight

Follow the `Coordinator Planning Preflight` section in
`<AI_DEV_SHOP_ROOT>/framework/workflows/multi-agent-pipeline.md`.

1. Identify the active feature from `$ARGUMENTS` or the most recently updated
   `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/`
   folder.
2. Read `pipeline-state.md`. For legacy runs only, fall back from
   `spec_entrypoint_path` to `spec_path`.
3. Resolve the active provider from `pipeline-state.md` and read:
   - `<AI_DEV_SHOP_ROOT>/framework/spec-providers/active-provider.md`
   - `<AI_DEV_SHOP_ROOT>/framework/spec-providers/core/provider-contract.md`
   - `<AI_DEV_SHOP_ROOT>/framework/spec-providers/<active-provider>/provider.md`
   - `<AI_DEV_SHOP_ROOT>/framework/spec-providers/<active-provider>/compatibility.md`
4. Run the provider compatibility gate exactly as written.
   - For Speckit, fill or replace the Coordinator row in `spec-dod.md`, then
     run `python3 <AI_DEV_SHOP_ROOT>/framework/spec-providers/speckit/validators/validate_spec_package.py <spec_folder_dir> --phase preflight`
     without `--update-hash`.
     Speckit `spec-dod.md` sign-off is outside the `spec_entrypoint_path` hash
     anchor. For any provider whose sign-off is inside its hash boundary,
     recompute the provider hash mechanically after signing and update
     `pipeline-state.md` before validation.
   - The provider-local validator must exit successfully. Do not visually or
     manually compute cryptographic hashes.
   - If `python3` is unavailable, try `python` or `py`. If the validator
     runtime is still unavailable, stop unless `pipeline-state.md` contains a
     human-approved single-line `validator_manual_waiver` with reviewer,
     timestamp, reason, and manual checks performed.
5. Verify `spec_hash` matches the provider hash anchor using validator output or
   a deterministic shell command, then record `spec_hash_verified_at`.
6. Verify the spec has human approval/sign-off recorded in the provider-defined
   readiness artifact or in `pipeline-state.md`.
7. Verify Red-Team has completed for this spec hash.
   - Any unresolved BLOCKING finding stops Software Architect dispatch.
   - Any CONSTITUTION_FLAG finding stops until a human decision is recorded.
8. If `system-blueprint.md` exists, verify its status is `APPROVED`.
   If no blueprint exists for a multi-domain, ownership-unclear, or existing
   codebase extension, stop and route to System Design.
9. If reverse-spec artifacts exist for this feature, verify the human checkpoint
   was cleared against `review-digest.md` and that `extraction-manifest.md`,
   `coverage-map.md`, `consumer-inventory.md`, `intentional-changes.md`, and
   characterization-test references are preserved in the planning surface.
10. If CodeBase Analyzer artifacts exist, verify the relevant
    `ANALYSIS-*`, `MIGRATION-*`, and `TESTABILITY-*` reports are recorded in
    `pipeline-state.md` and will be included in Software Architect context.

If any item fails, stop. Report the failed item, owning stage, and exact artifact
that must be repaired. Do not patch downstream artifacts to make the gate pass.

## Software Architect Dispatch

Only after the preflight passes, dispatch the Software Architect Agent with:

- `<AI_DEV_SHOP_ROOT>/agents/software-architect/skills.md`
- the active provider-defined planning surface and full Software Architect read set from
  the compatibility contract
- `<ADS_MEMORY_ROOT>/governance/constitution.md`
- approved `system-blueprint.md` if produced
- Red-Team findings, including advisory findings to acknowledge in the ADR
- relevant CodeBase Analyzer / migration / testability reports
- reverse-spec preservation artifacts when present

If helper-agent support is unavailable or the session is in single-agent mode,
adopt the Software Architect role after preflight passes and continue with the same
required inputs.

The Software Architect then follows `<AI_DEV_SHOP_ROOT>/agents/software-architect/skills.md` to
produce research (if required) and `adr.md`.

Output: preflight result, research path (if produced), ADR path, constitution
check result, parallel delivery plan, risks, recommended next command (`/tasks`
after human approves ADR).
