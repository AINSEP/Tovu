import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { DefaultMemberAccessResolver } from "../access-resolver.js";
import {
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../repo.memory.js";
import type { MemberContentAccess, MemberContext } from "../types.js";

const WORKSPACE_ID = "ws-1";
const NOW = "2026-07-10T00:00:00.000Z";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function anonymousContext(): MemberContext {
  return { isAuthenticated: false, activeTierIds: [], isPaid: false };
}

function authenticatedContext(activeTierIds: string[], isPaid: boolean): MemberContext {
  return { isAuthenticated: true, memberId: "member-1", activeTierIds, isPaid };
}

test("decide: public visibility always allows, authenticated or not", () => {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });
  const access: MemberContentAccess = { visibility: "public" };

  const anonDecision = resolver.decide({ access, context: anonymousContext() });
  assert.equal(anonDecision.allowed, true);
  assert.equal(anonDecision.teaser, false);

  const memberDecision = resolver.decide({ access, context: authenticatedContext([], false) });
  assert.equal(memberDecision.allowed, true);
});

test("decide: members visibility requires isAuthenticated, offers a teaser when denied", () => {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });
  const access: MemberContentAccess = { visibility: "members" };

  const deniedDecision = resolver.decide({ access, context: anonymousContext() });
  assert.equal(deniedDecision.allowed, false);
  assert.equal(deniedDecision.teaser, true);

  const allowedDecision = resolver.decide({ access, context: authenticatedContext([], false) });
  assert.equal(allowedDecision.allowed, true);
});

test("decide: paid visibility requires isAuthenticated AND isPaid", () => {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });
  const access: MemberContentAccess = { visibility: "paid" };

  assert.equal(resolver.decide({ access, context: anonymousContext() }).allowed, false);
  assert.equal(resolver.decide({ access, context: authenticatedContext([], false) }).allowed, false);
  assert.equal(resolver.decide({ access, context: authenticatedContext(["tier-1"], true) }).allowed, true);
});

test("decide: tiers visibility requires overlap between context.activeTierIds and access.tierIds", () => {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });
  const access: MemberContentAccess = { visibility: "tiers", tierIds: ["tier-gold", "tier-silver"] };

  assert.equal(
    resolver.decide({ access, context: authenticatedContext(["tier-bronze"], false) }).allowed,
    false,
    "no overlap should deny"
  );
  assert.equal(
    resolver.decide({ access, context: authenticatedContext(["tier-gold"], false) }).allowed,
    true,
    "overlap should allow"
  );
  assert.equal(
    resolver.decide({ access, context: anonymousContext() }).allowed,
    false,
    "anonymous is always denied even if tierIds happened to overlap"
  );
});

test("decide: an unknown/unparseable visibility value fails closed with no teaser", () => {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });
  // Simulates corrupt/unvalidated data reaching the decision (bypassing the
  // compile-time union) — the fail-closed contract must hold at runtime too.
  const access = { visibility: "vip-secret-club" } as unknown as MemberContentAccess;

  const decision = resolver.decide({ access, context: authenticatedContext(["tier-gold"], true) });
  assert.equal(decision.allowed, false);
  assert.equal(decision.teaser, false, "an unknown visibility must not offer a teaser");
  assert.equal(decision.reason, "unknown_visibility");
});

test("resolveContext returns the anonymous context when no session token is supplied", async () => {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });

  const context = await resolver.resolveContext({ workspaceId: WORKSPACE_ID, nowIso: NOW });
  assert.deepEqual(context, anonymousContext());
});

test("resolveContext returns the anonymous context for an unknown token", async () => {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });

  const context = await resolver.resolveContext({
    workspaceId: WORKSPACE_ID,
    sessionToken: "never-issued-token",
    nowIso: NOW,
  });
  assert.deepEqual(context, anonymousContext());
});

test("resolveContext returns the anonymous context for a revoked or expired session", async () => {
  const sessions = new InMemoryMemberSessionRepo([
    {
      id: "session-revoked",
      workspaceId: WORKSPACE_ID,
      memberId: "member-1",
      tokenHash: hashToken("revoked-token"),
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      revokedAt: "2026-02-01T00:00:00.000Z",
    },
    {
      id: "session-expired",
      workspaceId: WORKSPACE_ID,
      memberId: "member-1",
      tokenHash: hashToken("expired-token"),
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
    },
  ]);
  const resolver = new DefaultMemberAccessResolver({
    sessions,
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });

  const revokedContext = await resolver.resolveContext({
    workspaceId: WORKSPACE_ID,
    sessionToken: "revoked-token",
    nowIso: NOW,
  });
  assert.deepEqual(revokedContext, anonymousContext());

  const expiredContext = await resolver.resolveContext({
    workspaceId: WORKSPACE_ID,
    sessionToken: "expired-token",
    nowIso: NOW,
  });
  assert.deepEqual(expiredContext, anonymousContext());
});

test("resolveContext returns an authenticated context with activeTierIds + isPaid for a valid session", async () => {
  const sessions = new InMemoryMemberSessionRepo([
    {
      id: "session-valid",
      workspaceId: WORKSPACE_ID,
      memberId: "member-1",
      tokenHash: hashToken("valid-token"),
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    },
  ]);
  const tiers = new InMemoryMemberTierRepo([
    {
      id: "tier-gold",
      workspaceId: WORKSPACE_ID,
      name: "Gold",
      slug: "gold",
      type: "paid",
      status: "active",
      visibleInPortal: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
  ]);
  const subscriptions = new InMemoryMemberSubscriptionRepo([
    {
      id: "sub-1",
      workspaceId: WORKSPACE_ID,
      memberId: "member-1",
      tierId: "tier-gold",
      status: "active",
      source: "signup",
      startedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
  ]);
  const resolver = new DefaultMemberAccessResolver({ sessions, subscriptions, tiers });

  const context = await resolver.resolveContext({
    workspaceId: WORKSPACE_ID,
    sessionToken: "valid-token",
    nowIso: NOW,
  });

  assert.equal(context.isAuthenticated, true);
  assert.equal(context.memberId, "member-1");
  assert.deepEqual(context.activeTierIds, ["tier-gold"]);
  assert.equal(context.isPaid, true);
});

test("resolveContext: a valid session with an active subscription to a NON-paid tier reports isPaid:false", async () => {
  const sessions = new InMemoryMemberSessionRepo([
    {
      id: "session-free",
      workspaceId: WORKSPACE_ID,
      memberId: "member-1",
      tokenHash: hashToken("free-token"),
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    },
  ]);
  const tiers = new InMemoryMemberTierRepo([
    {
      id: "tier-free",
      workspaceId: WORKSPACE_ID,
      name: "Free",
      slug: "free",
      type: "free",
      status: "active",
      visibleInPortal: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
  ]);
  const subscriptions = new InMemoryMemberSubscriptionRepo([
    {
      id: "sub-free",
      workspaceId: WORKSPACE_ID,
      memberId: "member-1",
      tierId: "tier-free",
      status: "active",
      source: "signup",
      startedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
  ]);
  const resolver = new DefaultMemberAccessResolver({ sessions, subscriptions, tiers });

  const context = await resolver.resolveContext({
    workspaceId: WORKSPACE_ID,
    sessionToken: "free-token",
    nowIso: NOW,
  });

  assert.deepEqual(context.activeTierIds, ["tier-free"]);
  assert.equal(context.isPaid, false, "a resolved tier that is not type 'paid' must not flip isPaid");
});
