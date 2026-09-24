import type { ClockPort, IdGeneratorPort, UUID } from "@jini-ai/cms/core";
import type { WebhookSubscriptionRepoPort } from "./ports.js";
import type { WebhookSubscriptionRecord, WebhookTopic } from "./types.js";

/**
 * @file Webhook subscription CRUD (ADR-036 §2/§6) — the write-service behind the admin/AI
 * gateway handlers.
 *
 * Purpose:
 * `createSubscription` / `updateSubscription` / `pauseSubscription` / `deleteSubscription`.
 * Mirrors `src/features/post/post.ts`'s `updatePost` shape (required `{ deps, input }` +
 * optional second param), since these functions play the same "feature write-service" role.
 *
 * How it relates to the project:
 * - Every mutation here is the thing the ADR-036 §6 gateway/`authorize()` chokepoint calls —
 *   this file itself does no authorization; that lives in the (out-of-scope) route handler.
 * - `target_url` validation reuses `EgressPolicy`'s intent (only `https://`, only allowed
 *   hosts) but does NOT import `src/origin` directly — that module may not exist yet or be
 *   mid-build by another agent. Callers inject `isAllowedTarget`; production wiring plugs in
 *   the real SSRF/egress check once that module lands (see `WebhookSubscriptionDeps` doc).
 * - `deleteSubscription` never row-deletes (ADR-036 §2 / `WebhookSubscriptionRecord.disabledAt`
 *   doc: "Set (never row-deleted) when disabled, for audit durability") — it soft-disables via
 *   `repo.save`, matching that `WebhookSubscriptionRepoPort` has no `delete` method at all.
 *
 * Architectural role:
 * Feature-level business rules. Repositories stay behind `WebhookSubscriptionRepoPort`; Express
 * routes and admin/AI tool surfaces call these functions, never the repo directly.
 */

export class WebhookSubscriptionNotFoundError extends Error {}
export class WebhookSubscriptionValidationError extends Error {}

export interface WebhookSubscriptionDeps {
  clock: ClockPort;
  repo: WebhookSubscriptionRepoPort;
  idGenerator: IdGeneratorPort;
  /**
   * Egress allowlist check for a candidate `target_url` (beyond the flat `https://` scheme
   * requirement enforced here). Injected rather than importing `src/origin` directly — see the
   * file header. Production wiring: `core/origin`'s `isAllowedEgressTarget` (ADR-040).
   */
  isAllowedTarget: (url: string) => Promise<boolean>;
}

export interface CreateSubscriptionInput {
  workspaceId: UUID;
  ownerPrincipalId: UUID;
  label: string;
  targetUrl: string;
  topics: readonly WebhookTopic[];
  createdByPrincipalId: UUID;
  createdByPluginId?: string | null;
}

export interface CreateSubscriptionRequired {
  deps: WebhookSubscriptionDeps;
  input: CreateSubscriptionInput;
}

export interface WebhookSubscriptionOptional {}

/**
 * Create a new webhook subscription. Starts `active` with `secretVersion: 1` and no rotation in
 * progress (`previousSecretVersion: null`) — the signing secret itself is derived at delivery
 * time (ADR-036 §5), never generated or stored here.
 *
 * @complexity O(topics) for de-duplication; one repo write.
 * @overallScore 100
 */
export async function createSubscription(
  required: CreateSubscriptionRequired,
  _optional: WebhookSubscriptionOptional = {}
): Promise<{ subscription: WebhookSubscriptionRecord }> {
  const { deps, input } = required;
  const { label, targetUrl, topics } = await validateNewSubscription(input, deps.isAllowedTarget);

  const now = deps.clock.nowIso();
  const subscription: WebhookSubscriptionRecord = {
    id: deps.idGenerator.newId(),
    workspaceId: input.workspaceId,
    ownerPrincipalId: input.ownerPrincipalId,
    label,
    targetUrl,
    topics,
    secretVersion: 1,
    previousSecretVersion: null,
    status: "active",
    createdByPrincipalId: input.createdByPrincipalId,
    createdByPluginId: input.createdByPluginId ?? null,
    createdAt: now,
    updatedAt: now,
    disabledAt: null,
  };

  await deps.repo.insert(subscription);
  return { subscription };
}

export interface UpdateSubscriptionInput {
  workspaceId: UUID;
  id: UUID;
  label: string;
  targetUrl: string;
  topics: readonly WebhookTopic[];
}

export interface UpdateSubscriptionRequired {
  deps: WebhookSubscriptionDeps;
  input: UpdateSubscriptionInput;
}

/**
 * Update a subscription's label/target/topics. Does not touch `status` or secret versioning —
 * those are `pauseSubscription`'s and (deferred) rotation's job respectively.
 *
 * @complexity O(topics); one repo read + one repo write.
 * @overallScore 100
 */
export async function updateSubscription(
  required: UpdateSubscriptionRequired,
  _optional: WebhookSubscriptionOptional = {}
): Promise<{ subscription: WebhookSubscriptionRecord }> {
  const { deps, input } = required;

  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new WebhookSubscriptionNotFoundError(`webhook subscription '${input.id}' was not found`);
  }

  const label = input.label.trim();
  if (!label) throw new WebhookSubscriptionValidationError("label is required");

  const targetUrl = await validateTargetUrl({
    targetUrl: input.targetUrl,
    isAllowedTarget: deps.isAllowedTarget,
  });

  const topics = normalizeTopics(input.topics);
  if (topics.length === 0) {
    throw new WebhookSubscriptionValidationError("at least one topic is required");
  }

  const subscription: WebhookSubscriptionRecord = {
    ...existing,
    label,
    targetUrl,
    topics,
    updatedAt: deps.clock.nowIso(),
  };

  await deps.repo.save(subscription);
  return { subscription };
}

export interface PauseSubscriptionInput {
  workspaceId: UUID;
  id: UUID;
}

export interface PauseSubscriptionRequired {
  deps: WebhookSubscriptionDeps;
  input: PauseSubscriptionInput;
}

export interface PauseSubscriptionOptional {
  /** `true` (default) pauses; `false` resumes back to `active`. One function, both directions —
   * matches the CRUD list this library owes (no separate `resumeSubscription` was asked for). */
  paused?: boolean;
}

/**
 * Pause or resume an active/paused subscription. A `disabled` (soft-deleted) subscription is a
 * terminal state — it cannot be paused or resumed back to life; delete-then-recreate instead.
 *
 * @complexity O(1); one repo read + one repo write.
 * @overallScore 100
 */
export async function pauseSubscription(
  required: PauseSubscriptionRequired,
  optional: PauseSubscriptionOptional = {}
): Promise<{ subscription: WebhookSubscriptionRecord }> {
  const { deps, input } = required;
  const { paused = true } = optional;

  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new WebhookSubscriptionNotFoundError(`webhook subscription '${input.id}' was not found`);
  }
  if (existing.status === "disabled") {
    throw new WebhookSubscriptionValidationError(
      `webhook subscription '${input.id}' is disabled and cannot be paused or resumed`
    );
  }

  const subscription: WebhookSubscriptionRecord = {
    ...existing,
    status: paused ? "paused" : "active",
    updatedAt: deps.clock.nowIso(),
  };

  await deps.repo.save(subscription);
  return { subscription };
}

export interface DeleteSubscriptionInput {
  workspaceId: UUID;
  id: UUID;
}

export interface DeleteSubscriptionRequired {
  deps: WebhookSubscriptionDeps;
  input: DeleteSubscriptionInput;
}

/**
 * Soft-delete: sets `status: "disabled"` + stamps `disabledAt`. Never row-deletes (audit
 * durability, ADR-036 §2) — `WebhookSubscriptionRepoPort` has no `delete` method for exactly
 * this reason.
 *
 * @complexity O(1); one repo read + one repo write.
 * @overallScore 100
 */
export async function deleteSubscription(
  required: DeleteSubscriptionRequired,
  _optional: WebhookSubscriptionOptional = {}
): Promise<{ subscription: WebhookSubscriptionRecord }> {
  const { deps, input } = required;

  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new WebhookSubscriptionNotFoundError(`webhook subscription '${input.id}' was not found`);
  }

  const now = deps.clock.nowIso();
  const subscription: WebhookSubscriptionRecord = {
    ...existing,
    status: "disabled",
    disabledAt: now,
    updatedAt: now,
  };

  await deps.repo.save(subscription);
  return { subscription };
}

/**
 * The checks {@link createSubscription} runs before writing, exposed so a caller that must ask a
 * human first (the `webhooks_create_subscription` tool) can refuse bad input before showing a
 * dialog, and show the normalized values that will actually be stored.
 *
 * @throws {WebhookSubscriptionValidationError} a blank label, a bad or disallowed URL, or no topics.
 */
export async function validateNewSubscription(
  input: Pick<CreateSubscriptionInput, "label" | "targetUrl" | "topics">,
  isAllowedTarget: (url: string) => Promise<boolean>
): Promise<{ label: string; targetUrl: string; topics: WebhookTopic[] }> {
  const label = input.label.trim();
  if (!label) throw new WebhookSubscriptionValidationError("label is required");

  const targetUrl = await validateTargetUrl({ targetUrl: input.targetUrl, isAllowedTarget });

  const topics = normalizeTopics(input.topics);
  if (topics.length === 0) {
    throw new WebhookSubscriptionValidationError("at least one topic is required");
  }
  return { label, targetUrl, topics };
}

/**
 * Enforce `https://` (ADR-036 §4 SSRF/egress posture starts here) and defer to the injected
 * allowlist check. Returns the trimmed URL so callers store a normalized value.
 */
async function validateTargetUrl(params: {
  targetUrl: string;
  isAllowedTarget: (url: string) => Promise<boolean>;
}): Promise<string> {
  const trimmed = params.targetUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new WebhookSubscriptionValidationError(`target_url '${params.targetUrl}' is not a valid URL`);
  }

  if (parsed.protocol !== "https:") {
    throw new WebhookSubscriptionValidationError("target_url must use https://");
  }

  const allowed = await params.isAllowedTarget(trimmed);
  if (!allowed) {
    throw new WebhookSubscriptionValidationError(
      `target_url '${trimmed}' is not an allowed egress target`
    );
  }

  return trimmed;
}

/** Trim, drop blanks, and de-duplicate topics while preserving first-seen order. */
function normalizeTopics(topics: readonly WebhookTopic[]): WebhookTopic[] {
  const seen = new Set<string>();
  const normalized: WebhookTopic[] = [];

  for (const topic of topics) {
    const trimmed = topic.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}
