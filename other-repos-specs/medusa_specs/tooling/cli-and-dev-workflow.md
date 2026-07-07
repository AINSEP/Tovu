# CLI And Developer Workflow

## 1. Summary of the Subsystem

Medusa invests heavily in CLI-driven setup and lifecycle tooling.

The visible CLI/tooling surface includes:

- `create-medusa-app`
- `@medusajs/cli`
- `medusa-dev-cli`
- HTTP types generation
- OAS generation tools
- DB creation, migration, rollback, and link sync commands

This reinforces that Medusa sees platform operability and developer onboarding as part of the product.

## 2. Key Primitives / Contracts

Visible CLI concerns include:

- project creation with starter selection
- optional DB setup and seeding during bootstrap
- DB creation
- DB migration
- migration script execution
- rollback by module
- migration generation by module
- plugin DB migration generation
- sync links

The CLI also resolves commands from the local project, which shows Medusa expects the project package to expose its own command implementations rather than keeping all behavior in one global binary.

Other tooling surfaces:

- `@medusajs/http-types-generator`
- `@medusajs/medusa-oas-cli`
- `@medusajs/oas-github-ci`
- root integration test suites under `integration-tests/api`, `integration-tests/http`, and `integration-tests/modules`

## 3. Boundaries and Constraints

- Many commands only run inside a Medusa project root.
- Migration and link sync are treated as explicit lifecycle operations.
- Module boundaries reach the tooling layer: rollback and generation can target specific modules.
- Plugin development has its own build/develop/publish loops.

This means Medusa's modular architecture is supported operationally, not only structurally.

## 4. Operational Implications

- New projects can be scaffolded quickly.
- Schema and link evolution are controlled through explicit commands rather than hidden side effects.
- Module-level migrations align tooling with domain ownership.
- Integration tests exist at several system levels, which helps validate the composed runtime rather than only unit-level behavior.

## 5. Tovu Reconstruction Notes

### Why this exists

This subsystem matters because Tovu's modular architecture will fail in practice if the developer workflow does not support scaffolding, validation, migrations, and recovery operations cleanly.

### What Tovu should preserve

- CLI support for project bootstrap
- explicit schema and link lifecycle commands
- tooling that respects module boundaries
- integration tests that exercise the composed platform

### What Tovu can simplify

- fewer commands initially, focused on the highest-risk lifecycle actions
- one clearer workflow for local development before expanding into a larger CLI surface
- codegen only where it reduces real friction and stays behind explicit contracts

### Possible Tovu seams

- `ProjectBootstrapCli`
- `SchemaLifecycleCli`
- `ModuleMigrationCli`
- `LinkSyncCli`
- `IntegrationHarness`

### Suggested priority

- `V1`: bootstrap, migration, and validation commands
- `V2`: richer codegen and contributor tooling
