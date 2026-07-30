/**
 * @file ADR-049 Decision 4 — maps each feature's `agent-tools.ts` domain catalog into
 * `@jini-ai/core` `ToolRegistration`s, registered into the assistant's `ToolRegistry`
 * (`kernel.ts`) so a run's tool calls execute through `@jini-ai/daemon`'s `ToolExecutor`.
 *
 * Scope disclosure (ADR-049 "Deferred" list): only `features/content-types/agent-tools.ts`'s 5
 * non-destructive-cleanup entries, `forms/agent-tools.ts`'s 3 entries, and
 * `identity/agent-tools.ts`'s 10 entries are wired to real handlers so far —
 * `collections_plan_cleanup`/`collections_execute_cleanup` (token-gated destructive
 * ceremony) and the `database`/`recovery`/`widgets` catalogs are NOT registered yet. Calling
 * `ToolRegistry.list()` before this file is extended will not show them; that is intentional (no
 * silent stub registrations that could look like a bug if ever actually invoked) — extend
 * `buildAssistantToolRegistrations` when their mapping is designed, per ADR-049's own deferred item.
 *
 * Each wired registration publishes three things beyond its handler, all sourced from the same
 * catalog entry so none of them can drift from the domain's own declaration:
 *   - `descriptor.inputSchema` — the model-facing contract. Refused at build time if absent.
 *   - risk metadata, cross-checked against this file's own independent
 *     {@link DERIVED_RISK_BY_TOOL_ID} classification rather than trusted as declared.
 *   - an actor-class check that refuses to wire any tool whose stated human-confirmation
 *     requirement Tovu cannot currently honor (see
 *     {@link ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT}).
 *
 * `descriptor.requiresConfirmation` is deliberately still never set. Setting it today would park
 * the execution forever: `ToolExecutor` is constructed with no `ExecutionDelegate`, so the
 * confirmation promise has no resolver, and its timeout is armed only after the await. The
 * actor-class guard above is what keeps that a safe omission rather than a latent hole.
 *
 * `ToolPolicy.authorize` here is deliberately a pass-through `'allow'`: ADR-021 §2 is "one
 * evaluator" — every wired handler below already calls the SAME `deps.authorize()` (ADR-021's
 * `authorize()`) the human admin routes call, so a second gate at the `ToolPolicy` layer would be
 * a duplicate evaluator, not a stronger one. This was re-verified handler-by-handler (see
 * `__tests__/tool-registrations.authorization.test.ts`, which drives all five registrations
 * through a denying `authorize` and asserts each one refuses and writes nothing): all five domain
 * entrypoints — `registerContentType`, `updateContentTypeFields` (`write-service.ts`),
 * `deprecateContentType`, `reactivateContentType`, `tombstoneContentType` (`lifecycle.ts`) — open
 * with an `await deps.authorize({ permission: 'admin.collections.manage', ... })` that returns
 * `ForbiddenError` before any repo read, repo write, or index-provisioner call, and
 * `admin.collections.manage` is exactly what each of their five catalog entries declares under
 * `authorization.permission`. That test derives its expectations from the catalog itself, so if a
 * future tool is wired whose handler does NOT self-enforce (or declares a different permission),
 * it fails rather than silently inheriting this pass-through.
 */
import {
  contentTypesAgentToolCatalog,
  type AgentToolDefinition,
  type AgentToolSideEffect,
} from "../features/content-types/agent-tools";
import { parseContentTypeFieldDefs } from "../features/content-types/field-defs";
import { registerContentType, updateContentTypeFields } from "../features/content-types/write-service";
import { deprecateContentType, reactivateContentType, tombstoneContentType } from "../features/content-types/lifecycle";
import type { ContentTypeFieldDef, ContentTypeRecord } from "../features/content-types/types";
import type { RouteDeps } from "../server/routes/types";
import type { ToolHandler, ToolRegistration } from "@jini-ai/core";
import { formsAgentToolCatalog } from "../forms/agent-tools";
import { createFormDefinition, setFormDefinitionStatus, updateFormDefinition } from "../forms/write-service";
import type { FieldDescriptor, FormDefinitionRecord, FormDefinitionStatus, NotifyConfig } from "../forms/types";
import { FormFieldValidationError } from "../forms/errors";
// --- identity (users/roles), ADR-021 ---
import {
  assertCallerHasAnyPermission,
  assignRole,
  createRole,
  createUser,
  deleteRole,
  disablePrincipal,
  enablePrincipal,
  identityAgentToolCatalog,
  parseIdentityToolInput,
  updateRole,
  updateUser,
  type IdentityAgentToolDefinition,
  type PrincipalRecord,
  type PrincipalRoleRecord,
  type RoleRecord,
  type UserRecord,
} from "../identity";
import { identityServiceDepsFrom } from "../server/routes/admin/users/deps";

/**
 * Audit provenance stamped onto every revision row a tool handler here writes.
 *
 * A constant, not `ctx.principal`'s own kind, and that is the point: `ctx.principal.id` is the
 * HUMAN admin's principal id — Tovu's proxy reads it from the browser session and stamps it into
 * the run's `contextRef` (`server/modules/assistant.ts`), and the daemon hands it back here. So a
 * content-type change made by the assistant and one the same person made by clicking through the
 * admin UI record an identical `actorId`. What distinguishes them is the path, and reaching this
 * file IS the agent path — these handlers are only ever invoked by `@jini-ai/daemon`'s
 * `ToolExecutor` during a run. `'agent'` is therefore a fact about the call site, not a default.
 */
// Typed as the literal "agent" (not the wider `ActorPrincipalKind`/`CommandActor["kind"]` unions
// each domain declares) so this one constant satisfies both content-types' `principalKind` param
// and Forms' `CommandActor.kind` param without a cast at either call site.
const AGENT_TOOL_PRINCIPAL_KIND: "agent" = "agent";

/** The content-types catalog indexed by tool id — the single lookup used for descriptors, risk metadata, and schema-bearing error messages. */
const CONTENT_TYPES_CATALOG_BY_ID: ReadonlyMap<string, AgentToolDefinition> = new Map(
  contentTypesAgentToolCatalog.map((tool) => [tool.name, tool]),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`'${key}' (non-empty string) is required`);
  }
  return value;
}

function requireNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`'${key}' (number) is required`);
  }
  return value;
}

/**
 * Validates `input.fields` through the SAME boundary parser the admin HTTP routes use
 * (`features/content-types/field-defs.ts`), then re-throws any rejection with the tool's published
 * `inputSchema` appended.
 *
 * The appended schema is the error-recovery half of the contract: a model that gets back only
 * "fields[0].queryable must be a boolean" has to guess the rest of the shape, whereas one that
 * gets the schema alongside it can correct the call in a single turn.
 *
 * @complexity O(f) in the field count, delegated to the parser.
 * @overallScore 100
 */
function requireFields(input: Record<string, unknown>, toolId: string): ContentTypeFieldDef[] {
  const parsed = parseContentTypeFieldDefs(input.fields);
  if (parsed.ok) return parsed.value;
  const schema = CONTENT_TYPES_CATALOG_BY_ID.get(toolId)?.inputSchema;
  const recovery = "Fix the input and retry — this will not resolve on retry without an input change.";
  throw new Error(schema ? `${parsed.error.message}. ${recovery} Schema for '${toolId}': ${JSON.stringify(schema)}` : `${parsed.error.message}. ${recovery}`);
}

/** Wraps a `Result<T, Error>`-returning domain call as a `ToolHandler`: `ToolExecutor` treats a thrown error as a `'failed'` execution, so an `{ok:false}` becomes a throw rather than a silently-swallowed value. */
function fromResult<T>(fn: () => Promise<{ ok: true; value: T } | { ok: false; error: Error }>): Promise<T> {
  return fn().then((result) => {
    if (!result.ok) throw result.error;
    return result.value;
  });
}

/** What a content-type tool returns to the model — see {@link toContentTypeView}. */
interface ContentTypeToolView {
  key: string;
  label: string;
  status: ContentTypeRecord["status"];
  version: number;
  fields: ContentTypeFieldDef[];
  tombstonedAt?: string | null;
}

/**
 * Projects a `ContentTypeRecord` into the explicit model-facing shape, instead of returning the
 * domain record verbatim.
 *
 * Two reasons this is a named projection rather than a pass-through. `workspaceId` is dropped: the
 * agent is already scoped to one workspace it did not choose and cannot change, so echoing the id
 * back spends model attention on a value that can never inform a decision. And an explicit view
 * means a future field added to `ContentTypeRecord` — for a plugin, an internal counter, an
 * operator note — does not silently begin flowing to the model as a side effect of a domain change.
 *
 * `version` is deliberately kept: every mutating tool requires `expectedVersion`, so the model
 * needs the post-write value to make a correct follow-up call without re-reading.
 *
 * @param record - The content type as the domain returned it.
 * @returns The model-facing view. `tombstonedAt` is present only when set, so an active type's
 * payload carries no always-null key.
 * @complexity O(f) in the field count (the array is copied so the caller cannot alias domain state).
 * @overallScore 100
 */
function fromContentTypeResult(
  fn: () => Promise<{ ok: true; value: { contentType: ContentTypeRecord } } | { ok: false; error: Error }>,
): Promise<{ contentType: ContentTypeToolView }> {
  return fromResult(fn).then(({ contentType }) => ({ contentType: toContentTypeView(contentType) }));
}

function toContentTypeView(record: ContentTypeRecord): ContentTypeToolView {
  const view: ContentTypeToolView = {
    key: record.key,
    label: record.label,
    status: record.status,
    version: record.version,
    fields: [...record.fields],
  };
  if (record.tombstonedAt) view.tombstonedAt = record.tombstonedAt;
  return view;
}

function contentTypesDeps(routeDeps: RouteDeps) {
  return {
    repo: routeDeps.contentTypeRepo,
    clock: routeDeps.clock,
    ids: routeDeps.idGen,
    authorize: routeDeps.authorize,
    outbox: routeDeps.outbox,
    indexProvisioner: routeDeps.contentTypeIndexProvisioner,
  };
}

/** Descriptors for the 2 cleanup tools this pass does not wire — see file header. */
const UNWIRED_CONTENT_TYPES_TOOL_IDS = new Set(["collections_plan_cleanup", "collections_execute_cleanup"]);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls — deliberately a second, independent source rather than a read of the catalog's own
 * `sideEffects` field.
 *
 * The point is that a tool's risk must not be self-declared: a catalog entry that quietly
 * downgraded itself to `sideEffects:'none'` would otherwise become "safe" by editing one word, in
 * a file that carries no knowledge of which domain function runs. This table is maintained where
 * that knowledge lives — every entry here is a claim about the handler in this file — and
 * {@link assertRiskMetadataIsWirable} refuses to build if the two disagree. An id absent from this
 * table cannot be wired at all, so the conservative default is "refuse", not "assume safe".
 */
const DERIVED_RISK_BY_TOOL_ID: ReadonlyMap<string, AgentToolSideEffect> = new Map([
  // -> registerContentType (write-service.ts): repo.save + appendRevision in one tx.
  ["collections_content_type_define", "mutates-durable-state"],
  // -> updateContentTypeFields (write-service.ts): full field-schema replace + index transitions.
  ["collections_content_type_update_fields", "mutates-durable-state"],
  // -> deprecateContentType (lifecycle.ts): status flip + revision.
  ["collections_content_type_deprecate", "mutates-durable-state"],
  // -> reactivateContentType (lifecycle.ts): status flip + revision.
  ["collections_content_type_reactivate", "mutates-durable-state"],
  // -> tombstoneContentType (lifecycle.ts): one-way terminal transition that tears down every
  //    provisioned index BEFORE persisting the flip. The heaviest of the five.
  ["collections_content_type_tombstone", "mutates-durable-state"],
  // -> createFormDefinition (forms/write-service.ts): executeCommand -> repo.create + change-set + outbox.
  ["forms_create_definition", "mutates-durable-state"],
  // -> updateFormDefinition (forms/write-service.ts): executeCommand -> repo.update + change-set + outbox.
  ["forms_update_definition", "mutates-durable-state"],
  // -> setFormDefinitionStatus (forms/write-service.ts): executeCommand -> repo.update (status flip) +
  //    change-set + outbox. Never a delete: FormDefinitionRepoPort exposes no delete method (INV-08).
  ["forms_set_definition_status", "mutates-durable-state"],

  // --- identity (users/roles), ADR-021. Classified from what each handler in
  //     `buildIdentityRegistrations` actually calls, same rule as above: declared risk is never
  //     trusted, and an id absent from this table cannot be wired at all.
  // -> authorize() + repo reads only; no save on any path.
  ["identity_user_list", "none"],
  ["identity_role_list", "none"],
  // -> createUser (grant-service.ts): saves a principal row AND a users row (credential).
  ["identity_user_create", "mutates-durable-state"],
  // -> updateUser (admin-crud-service.ts): users.save, email field only.
  ["identity_user_update_email", "mutates-durable-state"],
  // -> disablePrincipal (admin-crud-service.ts): status flip, guarded by the INV-08 owner floor.
  ["identity_user_disable", "mutates-durable-state"],
  // -> enablePrincipal (admin-crud-service.ts): status flip back to active.
  ["identity_user_enable", "mutates-durable-state"],
  // -> createRole (grant-service.ts): roles.save, always isBuiltin=false.
  ["identity_role_create", "mutates-durable-state"],
  // -> assignRole (grant-service.ts): principalRoles.save behind the INV-07 grant clamp. The one
  //    identity tool that confers permissions, hence the heaviest of these.
  ["identity_role_assign", "mutates-durable-state"],
  // -> updateRole (admin-crud-service.ts): roles.save, refuses built-ins.
  ["identity_role_rename", "mutates-durable-state"],
  // -> deleteRole (admin-crud-service.ts): roles.delete, refuses built-ins and referenced roles.
  ["identity_role_delete", "mutates-durable-state"],
]);

/**
 * Actor-class rules that cannot be honored while no confirmation transport is wired.
 *
 * `confirmer-must-equal-own-delegatedBy` means "a human must confirm this, and the confirmer must
 * be the principal who delegated". Nothing in Tovu can currently deliver that: `ToolExecutor` is
 * built with no `ExecutionDelegate` (`agent-daemon-server.ts`), so `descriptor.requiresConfirmation`
 * would park the execution on a promise only `resumeConfirmation` can settle — and no route calls
 * it. The park is also unbounded, because `descriptor.timeoutMs`'s timer is armed only AFTER the
 * confirmation await.
 *
 * So a tool carrying this rule must not be wired at all. Today none is (`collections_execute_cleanup`
 * is declared unwired), which makes this guard a statement of the invariant rather than a fix — the
 * point is that a future edit wiring it would fail the build instead of silently shipping a tool
 * whose stated human-confirmation requirement is unenforceable. When a confirmation transport does
 * land, this constant is the deliberate place to relax.
 */
const ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT = new Set(["confirmer-must-equal-own-delegatedBy"]);

/**
 * Build-time gate on a single tool's risk metadata: refuses to wire a tool whose declared
 * `sideEffects` disagrees with {@link DERIVED_RISK_BY_TOOL_ID}, whose id this layer has not
 * classified at all, or whose `actorClassRule` needs a confirmation transport that does not exist.
 *
 * Throws rather than warning, and at registration time rather than call time, matching the two
 * drift guards this file already uses: a metadata inconsistency is a developer error that should
 * stop the daemon booting, not a runtime condition to degrade around.
 *
 * @param toolId - The wired tool id.
 * @param catalogEntry - Its `agent-tools.ts` catalog entry, the declared side of the comparison.
 * @throws {Error} If the tool is unclassified, misclassified, or needs missing confirmation support.
 * @complexity O(1) — two map/set lookups.
 * @overallScore 100
 */
export function assertRiskMetadataIsWirable(toolId: string, catalogEntry: AgentToolDefinition): void {
  const derived = DERIVED_RISK_BY_TOOL_ID.get(toolId);
  if (!derived) {
    throw new Error(`tool-registrations.ts: '${toolId}' has no entry in DERIVED_RISK_BY_TOOL_ID — classify what its handler actually does before wiring it (unknown operations are refused, never assumed safe)`);
  }
  if (derived !== catalogEntry.sideEffects) {
    throw new Error(`tool-registrations.ts: '${toolId}' declares sideEffects '${catalogEntry.sideEffects}' but this layer derives '${derived}' from what its handler calls — reconcile the two rather than trusting the declaration`);
  }
  if (catalogEntry.actorClassRule && ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT.has(catalogEntry.actorClassRule)) {
    throw new Error(`tool-registrations.ts: '${toolId}' declares actorClassRule '${catalogEntry.actorClassRule}', which requires a human-confirmation transport Tovu has not wired — leave it unwired until one exists (see ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT)`);
  }
}

function buildContentTypesRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    collections_content_type_define: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("input must be an object");
      const input = ctx.input;
      return fromContentTypeResult(() =>
        registerContentType({
          deps: contentTypesDeps(routeDeps),
          input: {
            actorId: ctx.principal.id,
            principalKind: AGENT_TOOL_PRINCIPAL_KIND,
            workspaceId: routeDeps.workspaceId,
            key: requireString(input, "key"),
            label: requireString(input, "label"),
            fields: requireFields(input, "collections_content_type_define"),
          },
        }),
      );
    },
    collections_content_type_update_fields: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("input must be an object");
      const input = ctx.input;
      return fromContentTypeResult(() =>
        updateContentTypeFields({
          deps: contentTypesDeps(routeDeps),
          input: {
            actorId: ctx.principal.id,
            principalKind: AGENT_TOOL_PRINCIPAL_KIND,
            workspaceId: routeDeps.workspaceId,
            key: requireString(input, "key"),
            fields: requireFields(input, "collections_content_type_update_fields"),
            expectedVersion: requireNumber(input, "expectedVersion"),
          },
        }),
      );
    },
    collections_content_type_deprecate: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("input must be an object");
      const input = ctx.input;
      return fromContentTypeResult(() =>
        deprecateContentType({
          deps: contentTypesDeps(routeDeps),
          input: {
            actorId: ctx.principal.id,
            principalKind: AGENT_TOOL_PRINCIPAL_KIND,
            workspaceId: routeDeps.workspaceId,
            key: requireString(input, "key"),
            expectedVersion: requireNumber(input, "expectedVersion"),
          },
        }),
      );
    },
    collections_content_type_reactivate: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("input must be an object");
      const input = ctx.input;
      return fromContentTypeResult(() =>
        reactivateContentType({
          deps: contentTypesDeps(routeDeps),
          input: {
            actorId: ctx.principal.id,
            principalKind: AGENT_TOOL_PRINCIPAL_KIND,
            workspaceId: routeDeps.workspaceId,
            key: requireString(input, "key"),
            expectedVersion: requireNumber(input, "expectedVersion"),
          },
        }),
      );
    },
    collections_content_type_tombstone: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("input must be an object");
      const input = ctx.input;
      return fromContentTypeResult(() =>
        tombstoneContentType({
          deps: contentTypesDeps(routeDeps),
          input: {
            actorId: ctx.principal.id,
            principalKind: AGENT_TOOL_PRINCIPAL_KIND,
            workspaceId: routeDeps.workspaceId,
            key: requireString(input, "key"),
            expectedVersion: requireNumber(input, "expectedVersion"),
          },
        }),
      );
    },
  };

  const registrations: ToolRegistration[] = [];
  for (const [id, handler] of Object.entries(handlers)) {
    const catalogEntry = CONTENT_TYPES_CATALOG_BY_ID.get(id);
    if (!catalogEntry) throw new Error(`tool-registrations.ts: catalog has no entry named '${id}' — content-types/agent-tools.ts drifted`);
    assertRiskMetadataIsWirable(id, catalogEntry);
    if (!catalogEntry.inputSchema) {
      throw new Error(`tool-registrations.ts: wired tool '${id}' publishes no inputSchema — add one to its catalog entry so the model gets a contract, or leave the tool unwired`);
    }
    registrations.push({
      descriptor: {
        id,
        description: catalogEntry.description,
        // Published so the model can form a correct call on the first try and self-correct from a
        // rejection in one turn (`requireFields` returns this schema with the failure). Enforcement
        // is NOT here — see `assertSchemaMatchesEnforcement`'s companion test for the drift pin.
        inputSchema: catalogEntry.inputSchema,
      },
      handler,
      // NOT an oversight, and NOT an unenforced tool. `catalogEntry.authorization.permission` is
      // enforced one layer down, by the domain function this handler calls, against the SAME
      // ADR-021 `authorize()` the human admin routes use — see this file's header for the
      // handler-by-handler verification and the test that keeps it honest. Adding a check here
      // would make the ToolPolicy a second evaluator of the same rule (ADR-021 §2 forbids that),
      // and — worse — a ToolPolicy-only check would be bypassable by any future non-tool caller of
      // the same domain function, which is precisely why the chokepoint owns the gate.
      policy: { authorize: () => "allow" },
    });
  }

  const unregistered = [...CONTENT_TYPES_CATALOG_BY_ID.keys()].filter((id) => !(id in handlers));
  for (const id of unregistered) {
    if (!UNWIRED_CONTENT_TYPES_TOOL_IDS.has(id)) {
      throw new Error(`tool-registrations.ts: catalog entry '${id}' is neither wired nor declared unwired — update UNWIRED_CONTENT_TYPES_TOOL_IDS or wire a handler`);
    }
  }

  return registrations;
}

// ---------------------------------------------------------------------------
// Forms (SPEC-010) — the three operations forms/write-service.ts exports.
// ---------------------------------------------------------------------------

/** The Forms catalog indexed by tool id — same lookup role `CONTENT_TYPES_CATALOG_BY_ID` plays. */
const FORMS_CATALOG_BY_ID: ReadonlyMap<string, AgentToolDefinition> = new Map(
  formsAgentToolCatalog.map((tool) => [tool.name, tool]),
);

/** What a Forms tool returns to the model — see {@link toFormDefinitionView}. */
interface FormDefinitionToolView {
  id: string;
  name: string;
  slug: string;
  status: FormDefinitionStatus;
  fields: FieldDescriptor[];
  notify: NotifyConfig;
}

/**
 * Projects a `FormDefinitionRecord` into an explicit model-facing shape rather than returning the
 * domain record verbatim — the same discipline {@link toContentTypeView} applies.
 *
 * `workspaceId` is dropped (the agent is already scoped to one workspace it cannot change, so the
 * id can never inform a decision) along with `createdAt`/`updatedAt` (timestamps no follow-up call
 * consumes). `id` is deliberately KEPT: every mutating Forms tool takes `formId`, so the model
 * needs it to make a correct follow-up call without re-reading. `slug` is kept because it is
 * immutable and is what a human will recognize the form by.
 *
 * @param record - The definition as the domain returned it.
 * @returns The model-facing view, with `fields`/`notify.recipients` copied so a tool caller cannot
 * mutate domain state through the returned object.
 * @complexity O(f) in the field count.
 * @overallScore 100
 */
function toFormDefinitionView(record: FormDefinitionRecord): FormDefinitionToolView {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status,
    fields: record.fields.map((field) => ({ ...field })),
    notify: { enabled: record.notify.enabled, recipients: [...record.notify.recipients] },
  };
}

function formsDeps(routeDeps: RouteDeps) {
  return {
    repo: routeDeps.formDefinitionRepo,
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    changeSets: routeDeps.changeSets,
    outbox: routeDeps.outbox,
    authorize: routeDeps.authorize,
  };
}

/**
 * Runs a Forms domain call and, on a validation rejection, re-throws with the tool's published
 * `inputSchema` appended — the error-recovery half of the contract that `requireFields` provides
 * for content-types. Forms validates inside `write-service.ts` rather than at a boundary parser,
 * so the schema is attached here instead of before the call.
 *
 * Only `FormFieldValidationError` is decorated: a `ForbiddenError` or `FormSlugConflictError` is
 * not a shape problem, and appending a schema to those would be noise the model must read past.
 *
 * @complexity O(1) beyond the wrapped call.
 * @overallScore 100
 */
async function withSchemaOnRejection<T>(toolId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof FormFieldValidationError)) throw error;
    const schema = FORMS_CATALOG_BY_ID.get(toolId)?.inputSchema;
    const recovery = "Fix the input and retry — this will not resolve on retry without an input change.";
    throw new Error(schema ? `${error.message}. ${recovery} Schema for '${toolId}': ${JSON.stringify(schema)}` : `${error.message}. ${recovery}`);
  }
}

function requireFormsStatus(input: Record<string, unknown>): FormDefinitionStatus {
  const value = input.status;
  if (value !== "active" && value !== "disabled") {
    throw new Error("'status' must be exactly 'active' or 'disabled'");
  }
  return value;
}

/**
 * Reads the optional patch members of `forms_update_definition`.
 *
 * An empty patch is refused rather than accepted as a no-op. `updateFormDefinition` would happily
 * re-save the unchanged record, and the tool would report success for a call that changed nothing —
 * which teaches the model its call worked. The human PUT route can tolerate that; a tool must not.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function requireFormsPatch(input: Record<string, unknown>): { name?: string; fields?: FieldDescriptor[]; notify?: NotifyConfig } {
  const patch: { name?: string; fields?: FieldDescriptor[]; notify?: NotifyConfig } = {};
  if (typeof input.name === "string") patch.name = input.name;
  if (Array.isArray(input.fields)) patch.fields = input.fields as FieldDescriptor[];
  if (input.notify !== undefined) patch.notify = input.notify as NotifyConfig;
  if (Object.keys(patch).length === 0) {
    throw new Error("at least one of 'name', 'fields', or 'notify' is required — 'slug' is immutable and is never updated");
  }
  return patch;
}

function buildFormsRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    forms_create_definition: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("input must be an object");
      const input = ctx.input;
      return withSchemaOnRejection("forms_create_definition", async () => {
        const { definition } = await createFormDefinition({
          deps: formsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            name: requireString(input, "name"),
            slug: requireString(input, "slug"),
            fields: Array.isArray(input.fields) ? (input.fields as FieldDescriptor[]) : [],
            notify: input.notify as NotifyConfig | undefined,
          },
        });
        return { definition: toFormDefinitionView(definition) };
      });
    },
    forms_update_definition: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("input must be an object");
      const input = ctx.input;
      return withSchemaOnRejection("forms_update_definition", async () => {
        const { definition } = await updateFormDefinition({
          deps: formsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            formId: requireString(input, "formId"),
            patch: requireFormsPatch(input),
          },
        });
        return { definition: toFormDefinitionView(definition) };
      });
    },
    forms_set_definition_status: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("input must be an object");
      const input = ctx.input;
      return withSchemaOnRejection("forms_set_definition_status", async () => {
        const { definition } = await setFormDefinitionStatus({
          deps: formsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            formId: requireString(input, "formId"),
            status: requireFormsStatus(input),
          },
        });
        return { definition: toFormDefinitionView(definition) };
      });
    },
  };

  const registrations: ToolRegistration[] = [];
  for (const [id, handler] of Object.entries(handlers)) {
    const catalogEntry = FORMS_CATALOG_BY_ID.get(id);
    if (!catalogEntry) throw new Error(`tool-registrations.ts: catalog has no entry named '${id}' — forms/agent-tools.ts drifted`);
    assertRiskMetadataIsWirable(id, catalogEntry);
    if (!catalogEntry.inputSchema) {
      throw new Error(`tool-registrations.ts: wired tool '${id}' publishes no inputSchema — add one to its catalog entry so the model gets a contract, or leave the tool unwired`);
    }
    registrations.push({
      descriptor: { id, description: catalogEntry.description, inputSchema: catalogEntry.inputSchema },
      handler,
      // Same rationale as the content-types block above: `admin.forms.manage` is enforced one layer
      // down by `executeCommand` inside every one of the three write-service functions, against the
      // SAME ADR-021 `authorize()` the human admin routes use. A second check here would be a
      // duplicate evaluator (ADR-021 §2), and a ToolPolicy-only check would be bypassable by any
      // future non-tool caller of the same domain function.
      policy: { authorize: () => "allow" },
    });
  }

  // Forms wires its ENTIRE catalog — there is no forms equivalent of
  // UNWIRED_CONTENT_TYPES_TOOL_IDS. This is the tripwire if a 4th entry is ever added.
  const unregistered = [...FORMS_CATALOG_BY_ID.keys()].filter((id) => !(id in handlers));
  if (unregistered.length > 0) {
    throw new Error(`tool-registrations.ts: forms catalog entr(ies) ${unregistered.join(", ")} are declared but not wired — wire a handler or declare them unwired`);
  }

  return registrations;
}

// ---------------------------------------------------------------------------
// identity (users/roles) — ADR-021
// ---------------------------------------------------------------------------

/** The identity catalog indexed by tool id — the single lookup for descriptors, gate permissions, and schema-bearing error messages. */
const IDENTITY_CATALOG_BY_ID: ReadonlyMap<string, IdentityAgentToolDefinition> = new Map(
  identityAgentToolCatalog.map((tool) => [tool.name, tool]),
);

/**
 * Upper bound on the roster `identity_user_list` will fan out over.
 *
 * `routes/admin/users/list.ts` does the same O(n) per-user fan-out uncapped, on the documented
 * "operator-managed roster, not member/content scale" assumption. That assumption is fine for a
 * human screen and NOT fine here for a different reason than scale: this result is spent as model
 * context, so an unexpectedly large roster would silently consume the run's context window. The
 * cap truncates and SAYS SO in the payload rather than failing, so a caller that hits it can still
 * work with what it got and knows not to treat the list as complete.
 */
const IDENTITY_USER_LIST_MAX = 200;

function requireIdentityCatalogEntry(toolId: string): IdentityAgentToolDefinition {
  const entry = IDENTITY_CATALOG_BY_ID.get(toolId);
  if (!entry) throw new Error(`tool-registrations.ts: identity catalog has no entry named '${toolId}' — identity/agent-tools.ts drifted`);
  return entry;
}

/**
 * Validates `input` through the tool's OWN published `inputSchema` (interpreted by
 * `identity/agent-tool-input.ts`), then re-throws any rejection with that schema appended.
 *
 * Same error-recovery contract as {@link requireFields} above: a model that gets back only
 * "'roleId' is required" must guess the rest of the shape, whereas one that gets the schema with
 * it can correct the call in a single turn.
 *
 * @complexity O(p) in the tool's declared property count.
 * @overallScore 100
 */
function identityInput(toolId: string, input: unknown): Readonly<Record<string, string>> {
  const entry = requireIdentityCatalogEntry(toolId);
  const parsed = parseIdentityToolInput({ schema: entry.inputSchema, input });
  if (parsed.ok) return parsed.value;
  const recovery = "Fix the input and retry — this will not resolve on retry without an input change.";
  throw new Error(`${parsed.error.message}. ${recovery} Schema for '${toolId}': ${JSON.stringify(entry.inputSchema)}`);
}

/** The permission set a tool's catalog entry declares — both halves when the gate is an OR. */
function identityPermissionsFor(toolId: string): string[] {
  const { authorization } = requireIdentityCatalogEntry(toolId);
  return authorization.orPermission ? [authorization.permission, authorization.orPermission] : [authorization.permission];
}

/**
 * The gate for the two READ tools.
 *
 * The mutating tools need no equivalent: their domain function opens with this same
 * `assertCallerHasAnyPermission` call itself. Reads have no service-layer function to inherit it
 * from — `identity` exports grant-writing transitions, not read wrappers, which is why
 * `routes/admin/users/list.ts` also gates in the route and then reads the repo ports directly.
 * This calls the domain's own exported helper rather than re-deriving an OR gate, so ADR-021 §2's
 * single evaluator is reached by an identical path from both tool kinds.
 */
async function assertIdentityReadAllowed(routeDeps: RouteDeps, toolId: string, callerPrincipalId: string): Promise<void> {
  await assertCallerHasAnyPermission({
    deps: identityServiceDepsFrom(routeDeps),
    workspaceId: routeDeps.workspaceId,
    callerPrincipalId,
    permissions: identityPermissionsFor(toolId),
  });
}

/** What an identity user tool returns to the model — see {@link toIdentityUserView}. */
interface IdentityUserToolView {
  principalId: string;
  username: string;
  status: PrincipalRecord["status"];
  roleIds: string[];
  email?: string;
}

/**
 * Projects a principal + its credential row into the explicit model-facing shape.
 *
 * The load-bearing omission is `UserRecord.passwordHash`: INV-05 keeps hashed secrets server-side,
 * and this view has no field for one, so there is nothing to forward by accident even if a future
 * `UserRecord` field is added. `workspaceId` is dropped for the same reason
 * {@link toContentTypeView} drops it — the agent is scoped to one workspace it cannot change, so
 * echoing the id spends model attention on a value that can never inform a decision.
 *
 * @param record.roleIds - The principal's role assignments, passed in rather than resolved here so
 * the projection stays pure and the caller decides whether the extra repo read is worth it.
 * @returns The model-facing view. `email` is present only when set, so a user without one carries
 * no always-undefined key.
 * @complexity O(r) in the role count (the array is copied so the caller cannot alias domain state).
 * @overallScore 100
 */
function toIdentityUserView(record: { principal: PrincipalRecord; user: UserRecord; roleIds: readonly string[] }): IdentityUserToolView {
  const view: IdentityUserToolView = {
    principalId: record.principal.id,
    username: record.user.username,
    status: record.principal.status,
    roleIds: [...record.roleIds],
  };
  if (record.user.email) view.email = record.user.email;
  return view;
}

/** What an identity role tool returns to the model. `isBuiltin` is kept because it is what predicts a rename/delete refusal. */
function toIdentityRoleView(role: RoleRecord): { id: string; name: string; isBuiltin: boolean } {
  return { id: role.id, name: role.name, isBuiltin: role.isBuiltin };
}

/** Read a principal's role-assignment ids. Shared by every tool that returns a user view. */
async function roleIdsFor(routeDeps: RouteDeps, principalId: string): Promise<string[]> {
  const links = await routeDeps.principalRoleRepo.listByPrincipalId({ workspaceId: routeDeps.workspaceId, principalId });
  return links.map((link) => link.roleId);
}

/**
 * Load the `UserRecord` paired with a principal the domain just returned.
 *
 * Every `kind='user'` principal has one by construction (CREATE_USER's atomicity guarantee), so
 * the miss is defensive rather than an expected path — the same reasoning `routes/admin/users/
 * disable.ts` records for its identical second lookup.
 */
async function requireUserRecord(routeDeps: RouteDeps, principalId: string): Promise<UserRecord> {
  const user = await routeDeps.userRepo.findByPrincipalId({ workspaceId: routeDeps.workspaceId, principalId });
  if (!user) throw new Error(`user '${principalId}' was not found`);
  return user;
}

function buildIdentityRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  /** Assembled per call, not per handler, because every mutating handler needs the identical bag. */
  const serviceDeps = () => identityServiceDepsFrom(routeDeps);

  const handlers: Record<string, ToolHandler> = {
    identity_user_list: async (ctx) => {
      identityInput("identity_user_list", ctx.input);
      await assertIdentityReadAllowed(routeDeps, "identity_user_list", ctx.principal.id);

      const principals = await routeDeps.principalRepo.list({ workspaceId: routeDeps.workspaceId });
      // Humans only — `system`/`agent`/`api_key` principals (including the disabled `user-local`
      // seed row) are not what "users" means on this surface, matching `routes/.../list.ts`.
      const humans = principals.filter((principal) => principal.kind === "user");
      const page = humans.slice(0, IDENTITY_USER_LIST_MAX);

      const users = await Promise.all(
        page.map(async (principal) => {
          const user = await routeDeps.userRepo.findByPrincipalId({ workspaceId: routeDeps.workspaceId, principalId: principal.id });
          if (!user) return null;
          return toIdentityUserView({ principal, user, roleIds: await roleIdsFor(routeDeps, principal.id) });
        }),
      );

      const listed = users.filter((user): user is IdentityUserToolView => user !== null);
      return humans.length > page.length
        ? { users: listed, truncated: true, totalCount: humans.length }
        : { users: listed };
    },

    identity_role_list: async (ctx) => {
      identityInput("identity_role_list", ctx.input);
      await assertIdentityReadAllowed(routeDeps, "identity_role_list", ctx.principal.id);

      const roles = await routeDeps.roleRepo.list({ workspaceId: routeDeps.workspaceId });
      return { roles: roles.map(toIdentityRoleView) };
    },

    identity_user_create: async (ctx) => {
      const input = identityInput("identity_user_create", ctx.input);
      const { principal, user } = await createUser({
        deps: serviceDeps(),
        input: {
          workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id,
          username: input.username,
          email: input.email,
          password: input.password,
        },
      });
      // A brand-new principal has no assignments yet, so this is [] by construction, not a read.
      return { user: toIdentityUserView({ principal, user, roleIds: [] }) };
    },

    identity_user_update_email: async (ctx) => {
      const input = identityInput("identity_user_update_email", ctx.input);
      const { user } = await updateUser({
        deps: serviceDeps(),
        input: {
          workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id,
          principalId: input.principalId,
          // Absent stays absent: `updateUser` treats a falsy email as "clear", which is exactly
          // what this tool's description tells the model omitting it does.
          email: input.email,
        },
      });
      const principal = await routeDeps.principalRepo.findById({ workspaceId: routeDeps.workspaceId, id: input.principalId });
      if (!principal) throw new Error(`principal '${input.principalId}' was not found`);
      return { user: toIdentityUserView({ principal, user, roleIds: await roleIdsFor(routeDeps, principal.id) }) };
    },

    identity_user_disable: async (ctx) => {
      const input = identityInput("identity_user_disable", ctx.input);
      const { principal } = await disablePrincipal({
        deps: serviceDeps(),
        input: {
          workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id,
          principalId: input.principalId,
          // Resolved by the caller, per `disablePrincipal`'s own contract — the same
          // `await deps.ownerPrincipalId` the human disable route performs.
          seededOwnerPrincipalId: await routeDeps.ownerPrincipalId,
        },
      });
      const user = await requireUserRecord(routeDeps, principal.id);
      return { user: toIdentityUserView({ principal, user, roleIds: await roleIdsFor(routeDeps, principal.id) }) };
    },

    identity_user_enable: async (ctx) => {
      const input = identityInput("identity_user_enable", ctx.input);
      const { principal } = await enablePrincipal({
        deps: serviceDeps(),
        input: { workspaceId: routeDeps.workspaceId, callerPrincipalId: ctx.principal.id, principalId: input.principalId },
      });
      const user = await requireUserRecord(routeDeps, principal.id);
      return { user: toIdentityUserView({ principal, user, roleIds: await roleIdsFor(routeDeps, principal.id) }) };
    },

    identity_role_create: async (ctx) => {
      const input = identityInput("identity_role_create", ctx.input);
      const { role } = await createRole({
        deps: serviceDeps(),
        input: { workspaceId: routeDeps.workspaceId, callerPrincipalId: ctx.principal.id, name: input.name },
      });
      return { role: toIdentityRoleView(role) };
    },

    identity_role_assign: async (ctx) => {
      const input = identityInput("identity_role_assign", ctx.input);
      const { assignment }: { assignment: PrincipalRoleRecord } = await assignRole({
        deps: serviceDeps(),
        input: {
          workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id,
          principalId: input.principalId,
          roleId: input.roleId,
        },
      });
      // The join row's own id is not addressable by any other tool, so it is dropped; what the
      // model needs back is confirmation of WHICH pair is now linked.
      return { assigned: { principalId: assignment.principalId, roleId: assignment.roleId } };
    },

    identity_role_rename: async (ctx) => {
      const input = identityInput("identity_role_rename", ctx.input);
      const { role } = await updateRole({
        deps: serviceDeps(),
        input: { workspaceId: routeDeps.workspaceId, callerPrincipalId: ctx.principal.id, roleId: input.roleId, name: input.name },
      });
      return { role: toIdentityRoleView(role) };
    },

    identity_role_delete: async (ctx) => {
      const input = identityInput("identity_role_delete", ctx.input);
      await deleteRole({
        deps: serviceDeps(),
        input: { workspaceId: routeDeps.workspaceId, callerPrincipalId: ctx.principal.id, roleId: input.roleId },
      });
      // `deleteRole` resolves void; an empty tool result would read to the model as "nothing
      // happened", so the deleted id is echoed as the acknowledgement.
      return { deleted: { roleId: input.roleId } };
    },
  };

  const registrations: ToolRegistration[] = [];
  for (const [id, handler] of Object.entries(handlers)) {
    const catalogEntry = requireIdentityCatalogEntry(id);
    assertRiskMetadataIsWirable(id, catalogEntry);
    registrations.push({
      descriptor: { id, description: catalogEntry.description, inputSchema: catalogEntry.inputSchema },
      handler,
      // Pass-through for the same ADR-021 §2 reason the content-types registrations use one: the
      // gate is the domain layer's, reached identically by both tool kinds (mutations through
      // their service function, reads through `assertIdentityReadAllowed`). A second check here
      // would be a duplicate evaluator, and one that any non-tool caller of the same service
      // function would bypass. See `__tests__/tool-registrations.identity-authorization.test.ts`.
      policy: { authorize: () => "allow" },
    });
  }

  const unregistered = [...IDENTITY_CATALOG_BY_ID.keys()].filter((id) => !(id in handlers));
  if (unregistered.length > 0) {
    throw new Error(`tool-registrations.ts: identity catalog entr(ies) ${unregistered.join(", ")} are not wired — wire a handler or remove the catalog entry`);
  }

  return registrations;
}

export function buildAssistantToolRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  return [...buildContentTypesRegistrations(routeDeps), ...buildFormsRegistrations(routeDeps), ...buildIdentityRegistrations(routeDeps)];
}
