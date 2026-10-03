# Codex gpt-6.1-sol (high) review of the Zana design — 2026-09-29

Input: self-contained packet = 2026-09-29-zana-two-way-app-contract.md + 2026-09-24-zana-admin-adapter-plan.md; no repo access.

- **1. Architecture weaknesses and wrong calls**
  - **“One hub” should mean one authority, not one process.** Separate public app APIs, privileged management APIs, build workers, and background jobs. Agent failures or builds must not take down live apps.
  - **The agent has excessive implied authority.** “Runs the backend” must become scoped management commands. Sandbox generated code; separate build credentials from production credentials; enforce permissions outside the model.
  - **An app key cannot authenticate a public client.** Anything shipped in web/mobile code is extractable. Treat it as a public project identifier; authorize through user sessions, server-derived tenant context, and endpoint policies.
  - **Generic entities and CRUD do not provide application architecture.** Bookings, inventory, and accounting need transactions, invariants, and explicit domain commands. Define how generated server-side behavior is installed, tested, versioned, and executed.
  - **Client-supplied events are not authoritative facts.** Derive `order.created` from a committed server transaction. Use an outbox, idempotent consumers, and deduplication for integration delivery.
  - **JSON Schema is insufficient as a form contract.** Specify a supported dialect/subset plus layout, conditional visibility, localization, accessibility, and error semantics. Permissions and sensitive validation stay server-side.
  - **“Copied source means no upgrades to chase” is wrong.** Ownership shifts update responsibility to the app. Record component versions and modifications; provide security updates and migration tooling.
  - **AI-generated platform variants need actual platform testing.** Shared fixtures verify semantics, but cannot establish native accessibility, keyboard behavior, lifecycle handling, or offline correctness.
  - **Code rollback does not undo production effects.** Schema rollback, data recovery, emails, and charges need different mechanisms. Prefer compatible migrations, tested restores, and compensating actions.
  - **Automatic production self-healing is premature.** Start with detection and tested repair proposals. Production changes require bounded authority, release gates, and rollback criteria.
  - **“Ports/adapters everywhere” and every caching layer invite abstraction overhead.** Add seams around real external dependencies. Introduce caches from measured needs, with tenant-safe keys and explicit invalidation.
  - **Resolve the earlier plan explicitly.** The owner’s later direction supersedes shared-shell extraction and Jini imports in generated apps. Tovu migration and comprehensive CMS extraction should not gate Zana.

- **2. Important omissions**
  - **Product:** A visible change proposal showing intended behavior, affected data, cost, preview, and recovery options. Voice requests are ambiguous; consequential assumptions need confirmation.
  - **Product:** An authoritative, versioned application specification containing acceptance criteria, permissions, business invariants, and unresolved decisions. Conversation summaries alone are insufficient.
  - **Product:** A coherent release unit linking frontend, server behavior, manifest, schema, and component versions. Specify compatibility windows for clients that update late, especially mobile.
  - **Product:** Tenant boundaries across projects, environments, organizations, and app users. Include cross-tenant access, caches, files, jobs, backups, and integration credentials.
  - **Product:** Operational ownership: support access, incident response, restore objectives, quotas, integration revocation, and complete export of data, files, configuration, and executable backend behavior.
  - **Product:** Admin workflows beyond generated edit screens: relationships, filters, pagination, bulk operations, permissions, and custom commands.
  - **Prompt:** Treat the prompt as guidance, not enforcement. Encode critical rules in authorization, sandboxing, schema checks, CI, deployment policy, and spend limits.
  - **Prompt:** Require independent acceptance checks, including negative authorization tests, concurrency tests for business invariants, migration compatibility, and failure handling. Agent-written tests can reproduce the agent’s misunderstanding.
  - **Prompt:** Treat repository text, retrieved content, submissions, and integration responses as untrusted input. They must not grant tool authority or expose secrets.
  - **Prompt:** Default to minimal changes and established dependencies; require evidence before adding infrastructure or abstractions. Record assumptions and report failed checks honestly.
  - **Prompt:** Redact secrets and personal data from telemetry; govern prompt/tool trace retention and access. Observability can become a second sensitive database.
  - **Prompt:** Replace “reversible migrations” as a blanket rule with explicit compatibility and recovery requirements. Some transformations cannot be safely reversed.

- **3. Scope and smallest proof**
  - **Defer:** Native platforms, offline sync, component generation for seven stacks, payments, custom admin plugins, multiple database adapters, broad integration catalogs, automatic production repairs, and HIPAA positioning.
  - **Forms are a plumbing milestone.** They prove delivery and submission, but barely test the claim that speaking can produce a correctly structured application.
  - **Smallest convincing slice:** One React web appointment-booking template, one isolated project, one database, owner/customer roles, and fixed appointment slots. A spoken request changes the app; the admin manages slots; customers book; server transactions prevent double booking.
  - **Essential machinery:** Persistent data, explicit server commands, a small Zana API contract, preview/live separation, versioned releases, basic audit/error reporting, and a demonstrated restore.
  - **Proof criteria:** A non-technical user creates and changes the workflow through conversation; concurrent bookings remain correct; unauthorized access fails; deployment preserves existing data; a failed change can be recovered.
  - **Build the needed API vertically.** Replace mocks for this workflow first. Do not replace the entire admin backend before establishing product value.

- **4. Ranked top five recommendations**
  1. **Define the authority boundary:** Public clients, admins, agents, and build workers get distinct permissions and credentials.
  2. **Prove a real business invariant:** Ship one web booking workflow with transactional server behavior, not only schema-driven CRUD.
  3. **Make changes recoverable:** Version the whole release, isolate previews, use compatible migrations, and test restores.
  4. **Move quality guarantees into executable gates:** Authorization, acceptance tests, migration checks, sandboxing, and budgets must survive prompt failure.
  5. **Cut the platform matrix:** Establish React web and a narrow contract first; expand only after repeated successful builds and changes.
