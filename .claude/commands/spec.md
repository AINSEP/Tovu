You are the Spec Agent. A new feature has been requested.

Feature description: $ARGUMENTS

Follow your workflow in `<AI_DEV_SHOP_ROOT>/agents/spec/skills.md`.

Before doing anything else:
1. Read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/active-provider.md`
2. Read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/core/provider-contract.md`
3. Read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/<active-provider>/provider.md`
4. If the active provider is `speckit`, read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/speckit/compatibility.md`

---

## Provider Rule

Do not assume the planning surface is always the Speckit strict package.

- If the active provider is `speckit`, use the provider-local strict package flow in `<AI_DEV_SHOP_ROOT>/framework/spec-providers/speckit/compatibility.md`.
- If the active provider is `openspec` or `bmad`, follow that provider's native planning surface and record `spec_provider`, `spec_entrypoint_path`, and `spec_readiness_artifact` in `pipeline-state.md`.

## Provider-Specific Workflow

After reading the active provider context (steps 1-4 above), follow the provider's compatibility contract at `<AI_DEV_SHOP_ROOT>/framework/spec-providers/<active-provider>/compatibility.md`.

That contract owns:
- Package shape and required files
- Templates path
- Numbered workflow steps
- Clarification rules
- Validation command
- Readiness gate (hard gate before `/plan`)

Do not duplicate provider-specific rules here. The compatibility contract is the single source of truth.

### Speckit

When the active provider is `speckit`:
1. Read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/speckit/compatibility.md`
2. Follow the Spec Package Flow in that file
3. Use templates from `<AI_DEV_SHOP_ROOT>/framework/spec-providers/speckit/templates/spec-system/`
4. Run `python3 <AI_DEV_SHOP_ROOT>/framework/spec-providers/speckit/validators/validate_spec_package.py <spec_path>` when Python is available

### OpenSpec

When the active provider is `openspec`:
1. Read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/openspec/compatibility.md`
2. Follow the Spec Package Flow in that file
3. Use templates from `<AI_DEV_SHOP_ROOT>/framework/spec-providers/openspec/templates/`
4. Run `python3 <AI_DEV_SHOP_ROOT>/framework/spec-providers/openspec/validators/validate_openspec_package.py <change_folder>` when Python is available

### BMAD

When the active provider is `bmad`:
1. Read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/bmad/compatibility.md`
2. Determine track (standard BMM or quick dev) per that file's flow
3. Use templates from `<AI_DEV_SHOP_ROOT>/framework/spec-providers/bmad/templates/`
4. Run `python3 <AI_DEV_SHOP_ROOT>/framework/spec-providers/bmad/validators/validate_bmad_package.py <output_folder>` when Python is available

---

## Common Workflow Steps (all providers)

1. Read `<ADS_PROJECT_KNOWLEDGE_ROOT>/governance/constitution.md`.
2. Determine the next FEAT number by scanning `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/` for existing feature folders (format: `NNN-feature-name/`). Use the next available three-digit number.
3. Derive a short feature name (2-4 words, action-noun format, lowercase-hyphenated) from the description.
4. Ask the user where to save spec artifacts (if not already specified).
5. Create `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/`. Record `spec_provider`, `spec_entrypoint_path`, `spec_readiness_artifact`, and any provider-specific fields in `pipeline-state.md`.
6. Follow the provider's compatibility contract for artifact creation, clarification, and validation.
7. Once the provider's readiness gate passes: output the spec package path and readiness for `/plan`.

---

## Output

- Feature folder path
- Spec package manifest (list of all files created, with one-line description of each)
- FEAT number
- Content hash
- Provider readiness gate result (all checks passing / items failing)
- Open questions (if any)
- Recommended next command (`/plan`)
