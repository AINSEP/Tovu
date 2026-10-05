import assert from "node:assert/strict";
import test from "node:test";

import { toApiKeyIssueResponse, toApiKeyPrincipalResponse } from "../api-keys.js";
import { toAdminDeliveryResponse, toAdminDeliverySummary, toAdminSubscriptionResponse } from "../integrations.js";
import { toAdminMediaListResponse, toAdminMediaResponse } from "../media.js";
import { toAdminMemberResponse } from "../members.js";
import { toAdminPolicyResponse, toAdminRoleResponse, toAdminUserResponse } from "../users.js";
import { toAdminWorkspaceResponse } from "../workspace.js";

// F1.2/F4.1: independent literal wire contracts; adding a record spread or dropping a field
// must fail. Extra internal fields deliberately make a passthrough distinguishable.
test("API-key principal projection sends only the five public fields", () => {
  const principal = {
    id: "machine-9", workspaceId: "ws-7", kind: "api_key" as const, status: "disabled" as const,
    displayName: "Nightly Export", createdAt: "2026-09-11T01:02:03Z", internalSecret: "hidden",
  };
  assert.deepEqual(toApiKeyPrincipalResponse(principal), {
    id: "machine-9", kind: "api_key", status: "disabled", workspaceId: "ws-7", displayName: "Nightly Export",
  });
});

test("issued key takes the one-time secret separately and preserves an explicit expiry", () => {
  const apiKey = {
    id: "key-9", workspaceId: "ws-7", principalId: "machine-9", label: "Export", expiresAt: "2027-01-02T03:04:05Z",
    keyHash: "DO-NOT-EXPOSE", prefix: "tovu_k9", createdAt: "2026-09-11T00:00:00Z", rawKey: "stale-record-value",
  } as Parameters<typeof toApiKeyIssueResponse>[0]["apiKey"];
  assert.deepEqual(toApiKeyIssueResponse({ apiKey, rawKey: "one-time-new-secret" }), {
    id: "key-9", principalId: "machine-9", label: "Export", expiresAt: "2027-01-02T03:04:05Z", rawKey: "one-time-new-secret",
  });
  assert.deepEqual(toApiKeyIssueResponse({ apiKey: { ...apiKey, expiresAt: undefined }, rawKey: "second-secret" }), {
    id: "key-9", principalId: "machine-9", label: "Export", expiresAt: null, rawKey: "second-secret",
  });
});

function delivery() {
  return {
    id: "delivery-9", workspaceId: "ws-7", subscriptionId: "subscription-4", eventId: "event-6", topic: "post.updated",
    status: "failed" as const, attempts: 3, nextAttemptAt: "2026-09-12T04:00:00Z",
    lastResponseStatus: 502, lastError: "gateway unavailable", signedWithVersion: 2,
    createdAt: "2026-09-11T00:00:00Z", deliveredAt: "2026-09-11T01:00:00Z", deadAt: "2026-09-12T02:00:00Z",
    payload: { private: "not part of the wire contract" },
  } as Parameters<typeof toAdminDeliveryResponse>[0];
}

test("webhook delivery projections retain failure details and omit internal payloads", () => {
  assert.deepEqual(toAdminDeliverySummary(delivery()), {
    id: "delivery-9", status: "failed", attempts: 3, lastResponseStatus: 502, lastError: "gateway unavailable",
    createdAt: "2026-09-11T00:00:00Z", deliveredAt: "2026-09-11T01:00:00Z",
  });
  assert.deepEqual(toAdminDeliveryResponse(delivery()), {
    id: "delivery-9", subscriptionId: "subscription-4", eventId: "event-6", topic: "post.updated",
    status: "failed", attempts: 3, nextAttemptAt: "2026-09-12T04:00:00Z", lastResponseStatus: 502,
    lastError: "gateway unavailable", signedWithVersion: 2, createdAt: "2026-09-11T00:00:00Z",
    deliveredAt: "2026-09-11T01:00:00Z", deadAt: "2026-09-12T02:00:00Z",
  });
});

test("subscription projection sends the delivery summary, clones topics, and represents no delivery as null", () => {
  const subscription = {
    id: "subscription-4", label: "Audit", targetUrl: "https://example.org/audit", topics: ["post.updated", "post.created"],
    status: "paused" as const, secretVersion: 4, previousSecretVersion: 3,
    createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z", disabledAt: null,
    workspaceId: "ws-7", ownerPrincipalId: "owner-1", createdByPrincipalId: "owner-1", createdByPluginId: "plugin-2",
    secret: "never-send-this",
  } as Parameters<typeof toAdminSubscriptionResponse>[0]["subscription"];
  const result = toAdminSubscriptionResponse({ subscription, lastDelivery: delivery() });
  assert.deepEqual(result, {
    id: "subscription-4", label: "Audit", targetUrl: "https://example.org/audit", topics: ["post.updated", "post.created"],
    status: "paused", secretVersion: 4, previousSecretVersion: 3,
    createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z", disabledAt: null,
    lastDelivery: {
      id: "delivery-9", status: "failed", attempts: 3, lastResponseStatus: 502, lastError: "gateway unavailable",
      createdAt: "2026-09-11T00:00:00Z", deliveredAt: "2026-09-11T01:00:00Z",
    },
  });
  result.topics.push("test-only.topic");
  assert.deepEqual(subscription.topics, ["post.updated", "post.created"]);
  assert.equal(toAdminSubscriptionResponse({ subscription, lastDelivery: null }).lastDelivery, null);
});

function media(id: string, sha256: string) {
  return {
    id, workspaceId: "ws-7", title: "Launch clip", slug: "launch-clip", alt: "Launch", caption: "Day one", credit: "Studio",
    source: { sha256 }, status: "active", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z",
    version: 8, width: 854, height: 480, cssClass: "hero-video", htmlAttributes: 'loading="lazy"', internalPath: "/private/blob",
  } as Parameters<typeof toAdminMediaResponse>[0]["media"];
}

test("media projection preserves metadata and uses the supplied content type and public URL", () => {
  assert.deepEqual(toAdminMediaResponse({ media: media("asset-9", "blob-sha-3"), contentType: "video/mp4", publicUrl: "/m/launch-clip", byteSize: 13 }), {
    id: "asset-9", workspaceId: "ws-7", title: "Launch clip", slug: "launch-clip", alt: "Launch", caption: "Day one", credit: "Studio",
    createdBy: null, byteSize: 13, sha256: "blob-sha-3", status: "active", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z",
    version: 8, width: 854, height: 480, cssClass: "hero-video", htmlAttributes: 'loading="lazy"', contentType: "video/mp4", publicUrl: "/m/launch-clip",
  });
});

// F4.3/F6.2: distinct id/sha keys, reversed map insertion, and independently absent entries.
test("media list joins content types by sha256 and URLs by id, with null for either missing lookup", () => {
  const result = toAdminMediaListResponse({
    media: [media("asset-a", "sha-a"), media("asset-b", "sha-b"), media("asset-c", "sha-c"), media("asset-d", "sha-d")],
    contentTypesBySha256: new Map([["sha-c", "image/png"], ["sha-b", "video/webm"], ["sha-a", "video/mp4"]]),
    publicUrlsById: new Map([["asset-d", "/m/d"], ["asset-b", null], ["asset-a", "/m/a"]]),
    byteSizesBySha256: new Map([["sha-b", 0], ["sha-a", 13], ["sha-c", null]]),
  });
  assert.deepEqual(result.media.map((item) => item.byteSize), [13, 0, null, null]);
  assert.deepEqual(result.media.map(({ id, sha256, contentType, publicUrl }) => ({ id, sha256, contentType, publicUrl })), [
    { id: "asset-a", sha256: "sha-a", contentType: "video/mp4", publicUrl: "/m/a" },
    { id: "asset-b", sha256: "sha-b", contentType: "video/webm", publicUrl: null },
    { id: "asset-c", sha256: "sha-c", contentType: "image/png", publicUrl: null },
    { id: "asset-d", sha256: "sha-d", contentType: null, publicUrl: "/m/d" },
  ]);
  assert.deepEqual(toAdminMediaListResponse({ media: [], contentTypesBySha256: new Map(), publicUrlsById: new Map(), byteSizesBySha256: new Map() }), { media: [] });
});

test("member projection excludes operator notes, extension fields and token material", () => {
  const member = {
    id: "member-9", workspaceId: "ws-7", email: "ada@example.org", name: "Ada", status: "disabled" as const,
    emailVerifiedAt: "2026-09-09T00:00:00Z", createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z", version: 7,
    note: "private operator annotation", fields: { private: "data" }, tokenHash: "private-hash",
  };
  assert.deepEqual(toAdminMemberResponse(member), {
    id: "member-9", workspaceId: "ws-7", email: "ada@example.org", name: "Ada", status: "disabled",
    emailVerifiedAt: "2026-09-09T00:00:00Z", createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z", version: 7,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(toAdminMemberResponse({ ...member, name: undefined, emailVerifiedAt: undefined }))), {
    id: "member-9", workspaceId: "ws-7", email: "ada@example.org", status: "disabled",
    createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z", version: 7,
  });
});

test("user projection preserves last-login metadata and grants without emitting password hashes", () => {
  const principal = {
    id: "user-9", workspaceId: "ws-7", kind: "user" as const, status: "disabled" as const,
    displayName: "Admin Nine", createdAt: "2026-09-08T00:00:00Z",
  };
  const user = {
    principalId: "user-9", workspaceId: "ws-7", username: "admin-nine", email: "admin@example.org",
    lastLoginAt: "2026-09-11T00:00:00Z", passwordHash: "never-expose",
  };
  assert.deepEqual(toAdminUserResponse({ principal, user, roleIds: ["role-3", "role-8"], policyIds: ["policy-5"] }), {
    principalId: "user-9", workspaceId: "ws-7", username: "admin-nine", email: "admin@example.org", status: "disabled",
    createdAt: "2026-09-08T00:00:00Z", lastLoginAt: "2026-09-11T00:00:00Z", roleIds: ["role-3", "role-8"], policyIds: ["policy-5"],
  });
});

test("role and policy projections retain built-in and frozen flags without internal fields", () => {
  assert.deepEqual(toAdminRoleResponse({ id: "role-3", workspaceId: "ws-7", name: "Reviewer", isBuiltin: true, internal: "hidden" } as Parameters<typeof toAdminRoleResponse>[0]), {
    id: "role-3", workspaceId: "ws-7", name: "Reviewer", isBuiltin: true,
  });
  assert.deepEqual(toAdminPolicyResponse({ id: "policy-5", workspaceId: "ws-7", name: "Snapshot", description: "Issued grants", isBuiltin: false, isFrozen: true, internal: "hidden" } as Parameters<typeof toAdminPolicyResponse>[0]), {
    id: "policy-5", workspaceId: "ws-7", name: "Snapshot", description: "Issued grants", isBuiltin: false, isFrozen: true,
  });
});

test("workspace projection includes creation time and emits only the public identity fields", () => {
  const workspace = { id: "ws-7", name: "Studio Seven", slug: "studio-seven", createdAt: "2026-09-08T00:00:00Z", internal: "hidden" };
  assert.deepEqual(toAdminWorkspaceResponse(workspace), {
    id: "ws-7", name: "Studio Seven", slug: "studio-seven", createdAt: "2026-09-08T00:00:00Z",
  });
});
