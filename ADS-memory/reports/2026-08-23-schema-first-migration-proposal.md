# Schema-first validation and OpenAPI migration proposal

- Date: 2026-08-23
- Status: proposal only — no production-code change is authorized by this document
- Scope: Tovu's 16 currently documented API feature fragments, with admin HTTP routes as the priority
- Decision: adopt **Zod 4 + `@asteasolutions/zod-to-openapi` v8** for new server HTTP contract modules, introduced one feature at a time through an in-place branch-by-abstraction migration.

## Executive decision

Use one per-operation contract definition containing Zod request schemas (`params`, `query`, and, where applicable, `body`), Zod response schemas, the method/path, security metadata, and response-status metadata. The Express registrar consumes that definition to validate and type the request; the OpenAPI generator consumes that *same definition* to produce the feature fragment. Handlers must register the path from the operation definition, not repeat a string literal.

This is intentionally an HTTP-adapter concern. Zod must not enter `src/redirects`, other domain modules, repositories, or Jini ports. Domain rules remain in existing chokepoints; the HTTP contract only checks the external shape and owns the mapping of shape errors to HTTP responses.

The smallest reversible proof is **only** `GET /api/admin/v1/workspaces/:workspaceId/redirects` (`list_redirects`). It is read-only, has an existing feature module and authorization coverage, and exposes an important compatibility trap: it currently accepts any string query value and returns no matches for an unknown filter rather than rejecting it.

## Evidence and scope notes

The following was inspected directly in the current worktree; no tests were run.

| Finding | Evidence | Consequence for this proposal |
|---|---|---|
| The server is Express 4.21.2. | Root `package.json` | Keep the existing route/module model; do not replace Express or add an opinionated router framework. |
| Tovu declares `zod-to-json-schema` `^3.25.2`, but not `zod` directly. | Root `package.json` and `package-lock.json` | Add a direct Zod dependency; do not rely on an incidental hoisted peer dependency. |
| The current install has Zod 4.4.3 at the root, while Jini's `protocol`, `agentic`, and `ui` packages declare Zod 3.25.76. | Root lockfile and `/Users/la/Programming/Jini/packages/*/package.json` | Contract schemas must use one direct Tovu Zod version. Do not mix a Jini-owned schema instance into these route contracts. |
| Tovu already converts a Jini UI manifest schema with `zod-to-json-schema`. | `src/assistant/component-catalog-query.ts` | Retain that narrow bridge initially. It is a different use case and should not become the new HTTP/OpenAPI mechanism. |
| The 16 handwritten fragments presently contain 129 `operationId` entries, not the approximately 90 operations stated in the brief. | `openapi/*.yaml` | Phase 0 must reconcile the count and explicitly exclude CLI-only, public, absent-handler, and intentionally omitted operations before estimating delivery. |
| Redirects has seven admin route registrars and an existing server-module seam. | `src/server/modules/redirects.ts` and `src/server/routes/admin/redirects/*` | It is a natural canary boundary. |
| The admin client keeps redirect input types broadly as `string`/`number`; its normal create form emits an allowed status code as a number. | `apps/admin/src/lib/api.ts`, `apps/admin/src/features/redirects/` | Client compatibility must be verified from actual calls, not inferred from the new schema's TypeScript type. |

`openapi/README.md` correctly frames the fragments as a high-value, hand-verified inventory, but also says their findings have not had a second human/peer verification. They are therefore migration evidence and acceptance input, not unquestionable runtime truth.

## Library decision

### Recommended stack

Add these as explicit root dependencies, with the exact patches selected by an implementation preflight and captured in the lockfile:

- `zod` in the Zod 4 line (the current root lock resolves 4.4.3)
- `@asteasolutions/zod-to-openapi` in its Zod-4-compatible v8 line (currently 8.4.0)

Use `OpenApiGeneratorV3` and set the generated document version to **OpenAPI 3.0.3**, matching the current fragments. Add a deterministic YAML serializer only to the documentation-generation tool if the repository does not already have one; it is build/dev-only, not request-path code.

`@asteasolutions/zod-to-openapi` is the missing connection between a Zod schema and route-level OpenAPI: it registers paths, parameters, request bodies, responses, components, descriptions, examples, and security definitions. Its documented purpose is precisely to avoid independently maintained validation and OpenAPI definitions. It supports Zod 4 and an OpenAPI v3 generator. [Library documentation](https://github.com/asteasolutions/zod-to-openapi/blob/master/README.md)

Do **not** use the already-installed `zod-to-json-schema` as the new API-doc generator. Its own documentation warns that accepting Zod 4 as a peer does not mean it supports Zod 4 schemas; it directs callers using Zod 4 to the Zod 3 compatibility import. That is unsuitable as the foundation for new HTTP contracts, particularly because Tovu already has both Zod 3 and Zod 4 in its dependency graph. [Compatibility note](https://github.com/StefanTerdell/zod-to-json-schema)

Keep the existing converter in `component-catalog-query.ts` until a separately scoped Jini/Zod-version cleanup. Changing it as part of this migration would add a second, unrelated risk.

### Alternatives considered

| Candidate | Fit | Trade-offs | Verdict |
|---|---|---|---|
| **Zod 4 + `@asteasolutions/zod-to-openapi`** | Strong | Best TypeScript ergonomics and contract-generation fit; already adjacent to the Jini ecosystem. Runtime parsing is interpretive rather than compiled, and the OpenAPI adapter is another dependency. Keep it server-only and build schemas once per module. | **Select** |
| TypeBox + Ajv | Viable | TypeBox makes JSON Schema directly and Ajv compiles efficient validators, which is attractive for a high-throughput public ingestion API. Tovu has neither dependency; preserving OpenAPI 3.0.3 needs a JSON-Schema/OpenAPI compatibility layer, and the developer experience would diverge from Jini's Zod contracts. Ajv's compiled-validator model is real, but the measured performance need does not exist here. [Ajv TypeScript guide](https://ajv.js.org/guide/typescript.html) | Runner-up if measured validation cost becomes material |
| Ajv/JSON Schema only | Viable | Strong polyglot/standards story, but the TypeScript type is no longer naturally inferred from the schema without additional patterns. It also adds manual OpenAPI operation assembly. | Not selected |
| `express-validator`, Joi, or Yup | Weak | They can validate Express requests, but introduce a separate OpenAPI-generation problem and weaker single-source TypeScript ergonomics. They are not current project dependencies. | Reject |
| An OpenAPI-first router/framework replacement | Rejected | It would couple the migration to a broad Express routing and error-lifecycle rewrite, changing all 129 currently documented operations at once. | Reject |
| Docs generated from TypeScript interfaces only | Rejected | Interfaces disappear at runtime, cannot validate untrusted input, and fail the owner’s one-schema/two-consumer requirement. | Reject |

The only Tovu-owned code should be thin integration glue: call `safeParse`, map failures to Tovu's established error envelope, and preserve each route's current ordering of workspace, validation, and authorization checks. This is not a reimplementation of a validation library; it is the app-specific policy that a generic Express middleware cannot know.

### Dependency and bundle/performance posture

- Zod is a **server runtime** dependency for these route schemas. Do not import server contracts into `apps/admin`; that avoids adding Zod to the browser bundle and maintains the deployment boundary.
- `@asteasolutions/zod-to-openapi` and the YAML writer belong only in the document-generation path. They should not be loaded by the server request path.
- Construct schemas at module load, never per request. Validate responses in unit/integration tests and optionally non-production environments; do not add response parsing to every production request before a measured need.
- Benchmark only if validation becomes a hot path. The required early measurement is a 500-rule redirects import on the real route shape, because that is the bounded caller-controlled batch in this feature; do not optimize ordinary admin reads preemptively.

## Target mechanism: one operation definition, two consumers

```text
HTTP request
  -> existing session middleware
  -> route's established workspace/auth ordering
  -> compatibility normalizer (temporary, only where legacy behavior needs it)
  -> Zod request schema parses `{ params, query, body }`
  -> existing handler/domain chokepoint
  -> DTO built from the Zod response schema's inferred output type
  -> Express response

Same operation definition
  -> OpenAPI registry/generator
  -> deterministic `openapi/<feature>.yaml`
```

An operation definition has these responsibilities:

1. `method`, `path`, `operationId`, tags, summary, security requirement, and response-status descriptions.
2. Zod schemas for `params`, `query`, and `body`; an absent body is explicit.
3. Zod schemas for every documented successful and error response envelope.
4. The compatibility mode for that operation (`observe` or `enforce`) and, only during migration, a named normalizer that preserves a proven legacy quirk.

The server module owns an array of its feature's operation definitions. The route registrar uses definitions from that array; the fragment generator iterates the same array. A feature catalog used by application composition and by the generator must expose the same modules, so a newly registered route cannot be silently absent from documentation.

This gives a single source for structural facts: path, method, parameters, body, response schemas, operation ID, and declared auth. It does **not** claim that Zod can prove business semantics such as redirect-loop detection or a missing mailer adapter. Those remain domain behavior, documented as response cases and protected by integration tests.

### Request-validation policy

- Parse into a new immutable input object; handlers must stop reading `req.params`, `req.query`, and `req.body` after the parse boundary.
- Return a stable machine-readable validation response, e.g. `{ error, code: "VALIDATION_ERROR", details: { issues: [...] } }`; never serialize a raw `ZodError` or request payload into the response/logs.
- Preserve current response precedence per route. A generic validation middleware placed before existing workspace/auth checks can create an observable breaking change (for example, changing an old 404/401 into a 400).
- Use Zod’s default stripping behavior only where it matches established behavior. Make `.strict()`, coercion, `catch`, transforms, and unknown-key policy deliberate operation decisions, never global defaults.
- Infer DTO and request TypeScript types from the schemas. Existing hand-written DTO interfaces can be retired feature by feature after parity tests pass.

### Response-validation policy

Response schemas are required even though the immediate runtime-validation requirement is inbound data. They are what makes the generated OpenAPI response shape trustworthy. The serializer should return an object typed as the schema's inferred output; test/dev helpers call `safeParse` on the outgoing payload. Production response validation starts disabled to avoid new latency/failure behavior, then can be enabled selectively after measurement.

## Worked example — the real Redirects list route

### Current behavior

`src/server/routes/admin/redirects/list.ts` registers this route and performs manual, non-validating narrowing:

```ts
app.get("/api/admin/v1/workspaces/:workspaceId/redirects", async (req, res) => {
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return;
  }

  // Authentication/authorization happens here.
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const source = typeof req.query.source === "string" ? req.query.source : undefined;
  const matchType = typeof req.query.matchType === "string" ? req.query.matchType : undefined;

  const rules = await deps.redirectRepo.list({
    workspaceId: deps.workspaceId,
    status: status as "active" | "disabled" | undefined,
    source: source as "manual" | "auto_slug_change" | "import" | undefined,
    matchType: matchType as "exact" | "prefix" | "wildcard" | "regex" | undefined,
  });
  res.json(toAdminRedirectListResponse(rules));
});
```

The casts are not validation. Both redirect repository implementations filter by equality; `?status=typo` therefore produces an empty list, while a repeated/non-string query value is discarded by the `typeof` check. The current fragment instead documents enum parameters, and also labels `workspaceId` UUID even though this handler does not validate that format.

### Canary-compatible schema-first shape

The following is a design sketch, not production code. It models the initial contract honestly and preserves behavior first.

```ts
// src/server/http/admin/redirects.contract.ts
const legacyOptionalQueryString = z.preprocess(
  (value) => (typeof value === "string" ? value : undefined),
  z.string().optional(),
);

const RedirectListParams = z.object({
  // `string`, not `.uuid()`: that is the current real behavior.
  workspaceId: z.string(),
});

const RedirectListQueryV1 = z.object({
  // `string`, not enum, initially: unknown strings currently return no matches.
  status: legacyOptionalQueryString,
  source: legacyOptionalQueryString,
  matchType: legacyOptionalQueryString,
}).strip();

const RedirectRule = z.object({
  id: z.string(),
  workspaceId: z.string(),
  matchType: z.enum(["exact", "prefix", "wildcard", "regex"]),
  fromPattern: z.string(),
  toTarget: z.string(),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
  status: z.enum(["active", "disabled"]),
  override: z.boolean(),
  priority: z.number(),
  source: z.enum(["manual", "auto_slug_change", "import"]),
  sourceEntryId: z.string().nullable(),
  fromPathAtCapture: z.string().nullable(),
  toPathAtCapture: z.string().nullable(),
  createdByPrincipal: z.string(),
  createdByPluginId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});

const RedirectListResponse = z.object({ data: z.array(RedirectRule) });

export const listRedirectsOperation = defineAdminOperation({
  method: "get",
  path: "/api/admin/v1/workspaces/{workspaceId}/redirects",
  operationId: "list_redirects",
  request: { params: RedirectListParams, query: RedirectListQueryV1 },
  security: { session: "adminSessionCookie", permission: "admin.redirects.manage" },
  responses: {
    200: json(RedirectListResponse, "Rules"),
    401: json(AdminErrorResponse, "Missing or invalid session"),
    403: json(AdminErrorResponse, "Missing redirect permission"),
    404: json(AdminErrorResponse, "Workspace path mismatch"),
    500: json(AdminErrorResponse, "Internal error"),
  },
});
```

The revised registrar takes its method/path from `listRedirectsOperation`. It preserves the current workspace check and authorization position, then calls a common `parseRequest(listRedirectsOperation, req)` and sends the existing repository call the parsed `query` values. The response is built as `RedirectListResponse` and checked in tests. The OpenAPI generator registers `listRedirectsOperation`; it does not repeat any path, parameter, or JSON response schema.

After characterization and an explicitly approved compatibility change, `RedirectListQueryV1` can become a strict `z.enum(...)` query contract. That would intentionally turn unknown strings and repeated values into a 400, so it needs a lifecycle decision—not an incidental schema cleanup.

### Why the other six Redirects operations are not bundled into the canary

The write routes demonstrate why migration must be granular:

- Create currently ignores malformed optional `override`/`priority` values rather than rejecting them.
- Update forwards several fields without route-level type checking; a schema could move a later domain error (or a surprising behavior) to an earlier 400.
- Import validates only that `rules` is an array of 1–500. Individual malformed rules deliberately reach the domain chokepoint and are reported per item in a `207`; a strict nested array item schema would incorrectly turn this into a top-level 400.
- `id` and `workspaceId` are currently string-coerced in get/update/delete/hits, not format-validated.

Each requires its own compatibility decision and tests. They are not proof that Zod is unsuitable; they are proof that the schema must describe real behavior before it is allowed to change it.

## Migration plan

This is an internal component migration, so branch-by-abstraction is a better fit than a proxy-style strangler at the network edge. No data migration, backfill, dual write, or second service is required. Each phase leaves the application deployable and should be one to three engineering days at most.

### Phase 0 — contract inventory and characterization plan (1–2 days)

1. Reconcile the 129 current fragment `operationId`s with the owner’s approximately-90 count. Mark each as: live admin route, live public route, CLI-only, documented-but-no-handler, intentionally undocumented, or out of scope.
2. For every live operation, record current validation/coercion/unknown-key behavior, error precedence, auth/permission, response statuses, and the admin/frontend caller(s).
3. Classify each request field as `preserve`, `normalize`, or `intentional contract change`. No enum, UUID, min/max, or `.strict()` rule may be added without a classification.
4. Add characterization tests before moving any operation whose route has no adequate coverage. Include malformed, repeated, extra-field, and boundary-size cases—not only happy paths.

**Gate:** inventory has a reviewed row for every in-scope operation; the operation count discrepancy is resolved; each canary behavior has an expected test result.

**Rollback:** none; this phase produces only planning/tests.

### Phase 1 — narrow contract foundation (1–2 days)

1. Add direct Zod and `zod-to-openapi` dependencies after a compatibility smoke test against Tovu’s Node/TypeScript configuration.
2. Create a small server-only contract helper that: registers an Express method/path from a definition, parses Zod inputs at an explicitly chosen point, maps errors to the standard envelope, and test-validates response bodies.
3. Create a deterministic feature-fragment generator and a check mode that fails if a committed generated file differs.
4. Do not alter existing route behavior or overwrite any handwritten fragment yet.

**Gate:** helper has isolated tests for parse success, parse failure, no raw error leakage, and response-schema failure; generated OpenAPI 3.0.3 passes structural validation; no server contract import reaches `apps/admin`.

**Rollback:** remove the new helper/generator/dependencies; no legacy route is yet routed through it.

### Phase 2 — canary: Redirects list only (about 1 day)

1. Add the compatibility-mode `listRedirectsOperation` and its response schemas.
2. Start in **observe** mode: run `safeParse`, emit a bounded metric/count by operation and failing field class, but continue using legacy extraction. Never log request bodies or credentials.
3. After expected traffic/test evidence, change that one operation to **enforce** mode and consume parsed input. Generate a side-by-side candidate fragment such as `openapi/009-redirects.schema-first.yaml`.
4. Semantically diff the candidate against `openapi/009-redirects.yaml`. Every difference is tagged `parity correction`, `intentional behavior change`, or `fragment error/unconfirmed`; unclassified differences block the next phase.

**Gate:** route integration tests preserve 401/403/404/200 ordering; unknown string filters and non-string query values retain the characterized behavior; generated `200` DTO is schema-valid; semantic document diff is fully dispositioned.

**Rollback:** return the operation to observe mode or re-register the old list handler. It is one read route and has no data side effects.

### Phase 3 — complete Redirects, one operation class at a time (2–3 days per small slice)

Order: get/hits/delete (path+response) → create/update (body plus domain errors) → import (bounded batch and 207 per-item result). Preserve the current route-specific error order where it is part of observable behavior. Replace the old `009` fragment only when all seven operations are generated and parity/intentional-change review is complete.

**Gate:** all existing redirects integration/auth tests remain, new input and response contract tests pass, and the checked-in generated fragment is fresh.

**Rollback:** restore the individual legacy parser/registrar; generated documentation remains a comparison artifact until the feature replacement is accepted.

### Phase 4 — remaining features in risk order (roughly 3–6 weeks for one engineer, after Phase 0 count reconciliation)

Migrate **one feature at a time**, each as a 1–3 day vertical slice:

1. Authenticated, read-only admin operations with existing route tests.
2. Authenticated CRUD features, keeping each feature's reads and writes in separate slices if behavior characterization is large.
3. Bounded public input, import, upload, or ingestion paths, with explicit body-size and abuse-limit review.
4. Auth, magic-link, API-key, provider-credential, and external-integration surfaces only after design-time security review and owner sign-off. Documentation generation must not itself expose a new unauthenticated `/openapi` endpoint.

**Gate per feature:** module operation list matches registrations, generated semantic fragment diff is resolved, validation response behavior is integration-tested, frontend client calls are rechecked, and CI verifies generated output freshness.

**Rollback:** the feature stays on its legacy parser/handwritten fragment or per-operation observe mode. There is no data rollback because the migration changes request handling and documents only.

### Phase 5 — contract tightening and legacy removal (separate, explicitly breaking work)

After a feature has been stable, promote only approved `preserve` fields to strict rules: enums, UUID/ULID formats, minimum/maximum lengths, unknown-key rejection, and coercion removal. Treat each as an API lifecycle change with consumer notice and compatibility period where callers exist. Only then remove compatibility normalizers, manual body parsers, hand-written DTO duplicates, and the superseded handwritten fragment source.

## Test and CI contract

The migration should add the following proof surfaces before broad rollout:

| Layer | What it proves |
|---|---|
| Schema unit tests | Canonical valid inputs, malformed inputs, normalizers, extra keys, repeated query values, and Zod issue-to-error-envelope mapping. |
| HTTP integration tests | Real Express route path, session/auth precedence, workspace scoping, permissions, status codes, and response body. This satisfies the project’s integration-boundary requirement. |
| Domain tests | Redirect loop/conflict/pattern behavior stays owned by existing domain chokepoints rather than silently duplicated in HTTP schemas. |
| Response-schema tests | Serializers produce the exact committed success/error envelope. |
| Generated-document test | Every operation definition appears exactly once in its fragment, and generated output is fresh and structurally valid as OpenAPI 3.0.3. |
| Semantic-diff review | The old hand-authored fragment and first generated fragment differ only in reviewed/dispositioned ways. |
| Consumer tests | Admin feature hook/API tests cover normal payloads; targeted external-runner contract tests cover the published fragment. |

The existing server test naming convention is `node:test`/`node:assert/strict` under `src/**/__tests__/*.test.ts`; retain it for legacy paths. New pipeline-numbered execution work must follow the newer `__tests__/unit` and `__tests__/integration` convention recorded in project memory. No test command should be assumed to be green until the implementation branch establishes its own baseline.

## Risks, behavior changes, and mitigations

| Risk | Concrete example/evidence | Mitigation and decision gate |
|---|---|---|
| Strict validation silently changes contracts | `list.ts` casts any query string to an enum type; `?status=typo` returns an empty list today. | Start with a string compatibility schema. Tighten to `z.enum` only through a separately approved breaking-change slice. |
| Optional malformed fields currently disappear | Redirect create/update accept only boolean `override` and number `priority`; malformed values become `undefined`. | Characterize first. Use a named compatibility normalizer temporarily, or explicitly reject with a documented migration notice. |
| Import semantics change from 207 to 400 | Redirect import only validates array cardinality; malformed members are intentionally per-item failures. | Schema only the top-level envelope/cardinality until an intentional redesign of item semantics is approved. |
| Middleware ordering changes security/404 behavior | Current list checks workspace before authorization; other routes validate at different points. | Put parsing at the current route position initially; test unauthenticated, wrong-workspace, forbidden, and malformed requests as a precedence matrix. |
| Admin/frontend callers rely on broad types | `apps/admin/src/lib/api.ts` declares redirect `matchType` and import fields as `string`; the import UI intentionally relies on server per-item validation. | Trace call sites in Phase 0; use generated client types later only behind a compatibility test. Do not make the admin import server contract modules. |
| Docs are generated but still incomplete | A manual generator catalog could omit a newly registered route; prose could contradict schema. | Use a shared feature module catalog for server registration and generation; CI checks registration/operation set equality; make generated YAML read-only by convention and banner it. |
| Zod version split causes runtime/type confusion | Tovu currently has root Zod 4 and Jini-owned Zod 3 schemas; current component code already documents cross-install casts. | Directly declare Zod 4 for Tovu contracts; prohibit passing a Jini schema to the contract generator; retain the existing converter bridge unchanged in this migration. |
| OpenAPI conversion loses semantics | Zod transforms/refinements and OpenAPI 3.0 nullable/union limits do not always map one-to-one. | Keep public request schemas declarative; put legacy normalization in named adapters; add generated-schema examples and structural validation; reject undocumented custom transforms at review. |
| Runtime cost or error volume | A 500-rule import creates bounded but larger parsing work. | Build schemas once, enforce the existing 500 cap, measure the batch after the canary, and keep response parsing test/dev-only initially. |
| Security observability leaks sensitive input | Validation issues could be logged alongside a request body; credential routes are in the inventory. | Log only operation ID, status, issue path/category, and correlation/request ID if available—never body values, cookies, tokens, or provider credentials. Security review is required for auth/credential/public-route waves. |

The **largest risk** is not adopting Zod; it is treating stricter schema declarations as harmless refactoring. The current handlers deliberately or accidentally coerce, discard, or pass through malformed data. A new 400 can break the admin UI, Runner, scripts, or hidden integrations even when the new rule is objectively better.

## Relationship to the existing `openapi/` fragments

Keep the fragments now, with three roles during migration:

1. **Migration inventory and review baseline.** They list routes, auth drift, error-shape drift, absent implementations, and intentional omissions discovered by the documentation pass.
2. **Semantic acceptance criteria, not byte-for-byte truth.** A generated fragment must be compared with the existing fragment. Every difference requires a disposition: preserve confirmed runtime behavior, intentional contract change, or correction to an unconfirmed/incorrect fragment. A fragment must not force preservation of a known defect or a claim that source inspection cannot confirm.
3. **Transitional published artifact.** While only part of a feature is schema-first, leave the current fragment published and generate a side-by-side candidate. Once a whole feature passes parity review, replace the same `openapi/<feature>.yaml` file with generated output bearing a `DO NOT EDIT — generated from ...` header. The contract definitions, not the emitted YAML, become the source of truth.

Do not discard all handwritten fragments now: that would remove the only cross-feature drift inventory before the generator has proven parity. Do not preserve them forever as editable sources: that recreates the two-sources-of-truth failure. Archive the final handwritten revision in Git history and retain a migration-diff record for each feature.

## Architecture assessment

### Pattern evaluation

| Pattern | Fit band | Adaptability | Evidence basis | Verdict |
|---|---|---|---|---|
| Per-feature operation descriptors plus a thin Express adapter (branch by abstraction) | Strong fit | High | Direct route/module evidence | **Selected:** introduces no service/router rewrite, keeps validation library at the HTTP edge, and migrates one feature at a time. |
| Shared generic middleware plus manual operation registry | Viable | Medium | Analogical | Lower local boilerplate, but can alter auth/workspace/error ordering and allow a registry to drift from registered routes. |
| Replace Express routing with an OpenAPI-first framework | Rejected | Low | Direct project topology | Violates incremental migration and expands scope from contracts to the entire HTTP lifecycle. |
| Retain handwritten docs and ad hoc validators | Rejected | Low | Direct OpenAPI findings | Fails the stated one-source-of-truth objective. |

### Quality attribute scorecard

| Axis | Score / confidence | Rationale, weakness, and mitigation |
|---|---|---|
| Modifiability | 5 / analogical | Schema, route metadata, inferred types, and OpenAPI change together. Weakness: OpenAPI annotation changes still need review; mitigate with generated-file CI. |
| Modularity | 4 / measured | Server modules already group Redirects registrars; HTTP-only contracts keep Zod out of core. Weakness: a global catalog can become a hub; keep each feature's definitions local. |
| Scalability | 4 / analogical | Admin validation is bounded and schemas are reused. Weakness: batch parsing cost; retain batch caps and measure imports. |
| Reliability | 4 / analogical | Characterization, observe mode, and per-operation rollback reduce migration risk. Weakness: parser ordering can change errors; protect it with route integration matrices. |
| Security | 4 / measured | Boundary validation and explicit auth metadata improve reviewability. Weakness: malformed-input telemetry and credential/public routes need careful redaction and security review. |
| Operability | 4 / analogical | Deterministic artifacts and diff checks make drift visible. Weakness: document build must be wired into CI; keep an explicit `--check` command. |
| Cost | 4 / analogical | Two focused dependencies plus a small adapter are lower-cost than a router rewrite. Weakness: temporary compatibility paths add short-term maintenance; schedule their removal per feature. |
| Testability | 5 / measured | Schemas, pure normalization, integration routes, and generated fragments have independently assertable outputs. Weakness: observed legacy quirks need explicit fixtures rather than generic examples. |

**Trade-off tension:** this plan accepts temporary compatibility adapters and slower, feature-by-feature delivery in exchange for avoiding a broad API behavior change and permanently removing schema/documentation duplication.

## Constitution and security check

| Article | Result | Rationale |
|---|---|---|
| I — Library-First | COMPLIES | Uses maintained schema/OpenAPI libraries. The small Tovu adapter is application-specific error/order integration, not a custom validator. |
| II — Test-First | COMPLIES for execution | Every migration slice requires initially failing characterization/contract tests before route changes. |
| III — Simplicity | COMPLIES | Scope is limited to the existing HTTP boundary and a concrete documentation-drift problem; no router/service replacement. |
| IV — Rule-of-Two | COMPLIES | No new domain port is proposed. The helper is ordinary HTTP composition code, not a swappable provider port. |
| V — Integration-First Testing | COMPLIES | Every operation slice requires real Express integration coverage. |
| VI — Security-by-Default | COMPLIES with required follow-up | The design validates at the trust boundary without moving authorization; credential/auth/public waves require security review and redacted telemetry. |
| VII — Spec Integrity | N/A to this planning artifact | The dispatch supplied no active implementation spec/hash. Implementation is blocked until a feature spec and hash cover the selected slice. |
| VIII — Observability | COMPLIES | Operation-level, redacted validation outcomes and generated-contract freshness are required evidence. |

Security boundary map: untrusted path/query/body data enters Express; existing session middleware performs authentication; route-level permission checks authorize actions; the new validator must sit inside that sequence without exposing payload values. The generated documents should be build artifacts, not a newly exposed unauthenticated runtime endpoint.

## Implementation readiness and handoff

Before implementation, the owner/team must approve:

1. Whether the scope is the approximately 90 operations in the brief or the 129 `operationId`s currently present in fragments, and how non-admin/absent routes are counted.
2. The compatibility policy for malformed input: preserve first, or intentionally tighten selected fields now.
3. The public/distribution policy for generated OpenAPI (checked-in artifacts only is recommended for the first slice).
4. An active, hashed feature spec for the canary.

Suggested next assignee: Spec Agent for the canary's compatibility/acceptance matrix, then TDD Agent for the initially failing route/schema/document tests. A security-design review should precede any auth, public magic-link, API-key, or credential-route migration.

## Sources consulted

- `openapi/README.md` and all current OpenAPI fragment filenames
- `package.json`, `package-lock.json`, `apps/admin/package.json`
- `/Users/la/Programming/Jini/packages/{protocol,agentic,ui}/package.json` (read-only)
- `src/server/routes/admin/redirects/{list,create,update,import,get-by-id,hits,tombstone}.ts`
- `src/server/http/admin/redirects.ts`, `src/server/modules/redirects.ts`, `src/redirects/{types,ports,repo.memory,repo.sqlite}.ts`
- `apps/admin/src/lib/api.ts` and `apps/admin/src/features/redirects/`
- Existing project architecture/constitution guidance and the upstream library documentation linked above
