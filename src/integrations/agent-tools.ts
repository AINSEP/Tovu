/**
 * @file The Integrations (webhooks) domain's agent-tool catalog, instantiating SPEC-016 REQ-22's
 * naming/callability convention (the same shape `features/workspace/agent-tools.ts`,
 * `newsletter/agent-tools.ts`, and every other domain catalog already use).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes. Every
 * entry maps 1:1 onto a real admin HTTP route already exposed to a human operator
 * (`server/routes/admin/integrations/*.ts`) — this catalog never names an operation the admin UI
 * does not already perform.
 *
 * `server/routes/admin/integrations/` exposes exactly 5 routes: list, create, pause (both
 * directions), delete (soft), and deliveries (a per-subscription delivery log read). All 5 are
 * wired here — plain webhook-subscription CRUD/read over already-durable rows, no credential
 * material anywhere in the response shape (`WebhookSubscriptionRecord` has no secret field at all;
 * see `server/http/admin/integrations.ts`'s own header for why there is nothing to redact).
 *
 * Deliberately absent from this catalog entirely (not merely unwired — there is no operation to
 * even name a tool against, the same framing `identity/agent-tools.ts` uses for role revocation):
 *
 *   - Subscription UPDATE. `subscriptions.ts` exports `updateSubscription` (rewrites label/
 *     targetUrl/topics), but NO admin route calls it — `server/routes/admin/integrations/` has no
 *     `update.ts`/PATCH/PUT handler at all. Wiring a tool for it would hand an agent a capability
 *     the human admin UI itself does not expose today, which is exactly what every catalog in this
 *     codebase says it never does. If an update route ships later, its tool belongs in the same
 *     pass that ships it, mirrored 1:1 like every other entry here.
 *   - Signing-secret rotation/generation/reveal. `signing.ts`/`signing.keyring.ts`/`keyring.env.ts`/
 *     `keyring.memory.ts` derive a subscription's HMAC signing secret via
 *     `KeyringPort.deriveSigningSecret` (HKDF over the install root key) at delivery time — the
 *     secret is NEVER stored, and no admin route reveals, regenerates, or rotates it (there is no
 *     rotation admin route at all yet; `WebhookSubscriptionRecord.previousSecretVersion` exists in
 *     the type but nothing currently writes a rotation). Even if such a route existed, root-key /
 *     signing-secret material is credential-adjacent in exactly the same class as Identity's
 *     excluded `resetUserPassword`: reachable-by-prompt-injection agent access to a lever that
 *     controls what a third party trusts as an authentic webhook from this workspace is a
 *     capability the admin UI reserves for a human, not this catalog's default. Defaults to
 *     EXCLUDED regardless of whether a future admin route surfaces it.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` (ADR-021 §2) enforces the actual permission checks at call
 * time — this module only declares the catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `integrations` domain logic. No dependencies — `WebhookTopic` is a plain `string` (the topic
 * catalog is the domain-event name namespace, not a fixed enum this file could import without
 * depending on every event-emitting domain), so `topics` is published as a free-form string array,
 * validated (non-empty after trim, de-duplicated, at least one required) by `subscriptions.ts`
 * itself, same as the admin UI's own free-text topic entry.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  /**
   * JSON Schema for this tool's `input`, published via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registration-kit.ts`'s `buildDomainRegistrations`, which refuses to wire any
   * tool lacking one). Every entry in this catalog is wired, so this is required, not optional —
   * mirrors `identity/agent-tools.ts`'s identical reasoning.
   */
  inputSchema: Readonly<Record<string, unknown>>;
}

const SUBSCRIPTION_ID_PROPERTY = {
  type: "string",
  minLength: 1,
  description: "A webhook subscription's id, as returned by integrations_create_subscription or integrations_list_subscriptions.",
} as const;

const SUBSCRIPTION_ID_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subscriptionId"],
  properties: { subscriptionId: SUBSCRIPTION_ID_PROPERTY },
} as const;

const LABEL_PROPERTY = { type: "string", minLength: 1, description: "Human-readable label shown in the admin UI." } as const;

const TARGET_URL_PROPERTY = {
  type: "string",
  minLength: 1,
  description: "The absolute https:// URL deliveries are POSTed to. Must be https and must resolve against this workspace's egress allowlist, or the write is refused.",
} as const;

const TOPICS_PROPERTY = {
  type: "array",
  minItems: 1,
  items: { type: "string", minLength: 1 },
  description:
    "Event topics this subscription matches (e.g. 'post.published'). At least one is required; blanks are dropped and duplicates de-duplicated. A trailing '.*' matches every action for an entity.",
} as const;

const CREATE_SUBSCRIPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "targetUrl", "topics"],
  properties: {
    label: LABEL_PROPERTY,
    targetUrl: TARGET_URL_PROPERTY,
    topics: TOPICS_PROPERTY,
  },
} as const;

const PAUSE_SUBSCRIPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subscriptionId"],
  properties: {
    subscriptionId: SUBSCRIPTION_ID_PROPERTY,
    paused: { type: "boolean", description: "true (default) pauses delivery; false resumes an already-paused subscription back to active. Cannot resume a deleted (disabled) subscription." },
  },
} as const;

const GET_DELIVERIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subscriptionId"],
  properties: {
    subscriptionId: SUBSCRIPTION_ID_PROPERTY,
    limit: { type: "integer", minimum: 1, description: "Max rows to return, newest first. Defaults to 50; capped at 200 regardless of what is requested." },
  },
} as const;

/**
 * The Integrations domain's fixed agent-tool catalog. See this file's header for the two whole
 * classes of operation deliberately absent (subscription update; signing-secret rotation/
 * generation/reveal).
 *
 * @complexity O(1) — a fixed, statically-defined list.
 * @overallScore 100
 */
export function getIntegrationsAgentToolCatalog(): AgentToolDefinition[] {
  return [
    {
      name: "integrations_list_subscriptions",
      description: "Lists the workspace's webhook subscriptions, each annotated with its most recent delivery attempt (if any). Read-only.",
      sideEffects: "none",
      authorization: { permission: "admin.integrations.manage" },
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {},
      },
    },
    {
      name: "integrations_get_deliveries",
      description: "Fetches the delivery log (status, attempts, last response, timestamps) for one webhook subscription, newest first.",
      sideEffects: "none",
      authorization: { permission: "admin.integrations.manage" },
      inputSchema: GET_DELIVERIES_SCHEMA,
    },
    {
      name: "integrations_create_subscription",
      description:
        "Creates a new webhook subscription. Starts active at signing-secret generation 1 — the signing secret itself is never generated or exposed by this tool (it is derived at delivery time from the install root key, never stored).",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.integrations.manage" },
      inputSchema: CREATE_SUBSCRIPTION_SCHEMA,
    },
    {
      name: "integrations_pause_subscription",
      description: "Pauses or resumes a webhook subscription's deliveries. One tool, both directions (paused defaults to true). Refused if the subscription is already deleted (disabled).",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.integrations.manage" },
      inputSchema: PAUSE_SUBSCRIPTION_SCHEMA,
    },
    {
      name: "integrations_delete_subscription",
      description:
        "Soft-deletes a webhook subscription (never row-deleted, for audit durability). Safe to call again on an already-deleted subscription — it does not error, though disabledAt/updatedAt are stamped again.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.integrations.manage" },
      inputSchema: SUBSCRIPTION_ID_SCHEMA,
    },
  ];
}
