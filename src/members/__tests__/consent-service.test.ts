import assert from "node:assert/strict";
import test from "node:test";

import type { ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";
import { InMemoryMemberConsentRepo, InMemoryMemberRepo } from "../repo.memory";
import { checkConsent, confirmConsent, requestConsent, revokeConsent } from "../consent-service";
import { MemberNotFoundError } from "../types";
import type { ConsentServiceDeps } from "../consent-service";

/**
 * @file FEAT-013 Phase 3 (ADR-PIPE-013 Decision §4, D1c) — the consent
 * chokepoint. INV-NEW-02: `member_consents.status` may only become `'granted'`
 * via `confirmConsent`, and only when an existing `'pending'` row for that
 * `(memberId, purpose)` exists.
 */

const WORKSPACE_ID = "ws-1";
const MEMBER_ID = "member-1";
const PURPOSE = "newsletter:list-1";

function makeClock(initialIso: string): ClockPort & { set(iso: string): void } {
  let current = initialIso;
  return {
    nowIso: () => current,
    set: (iso: string) => {
      current = iso;
    },
  };
}

function makeIds(prefix: string): IdGeneratorPort {
  let counter = 0;
  return { newId: () => `${prefix}-${++counter}` };
}

function makeDeps(overrides: Partial<ConsentServiceDeps> = {}): ConsentServiceDeps {
  const clock = makeClock("2026-07-13T00:00:00.000Z");
  const ids = makeIds("id");
  const members = new InMemoryMemberRepo([
    {
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
      email: "member@example.com",
      status: "active",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      version: 1,
    },
  ]);
  const consents = new InMemoryMemberConsentRepo();
  return { clock, ids, members, consents, ...overrides };
}

test("T028/INV-NEW-02: requestConsent creates exactly one pending value row + one same-tx revision row", async () => {
  const deps = makeDeps();

  const { consent } = await requestConsent({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      memberId: MEMBER_ID,
      purpose: PURPOSE,
      evidence: { source: "newsletter-signup-form" },
      originModule: "newsletter",
    },
  });

  assert.equal(consent.status, "pending");

  const found = await deps.consents.findByMemberAndPurpose({ workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE });
  assert.ok(found);
  assert.equal(found!.status, "pending");

  const revisions = await deps.consents.listRevisions({ workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].op, "consent_request");
  assert.equal(revisions[0].originModule, "newsletter");
});

test("requestConsent throws MemberNotFoundError for an unknown memberId and creates no row", async () => {
  const deps = makeDeps();

  await assert.rejects(
    () =>
      requestConsent({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          memberId: "no-such-member",
          purpose: PURPOSE,
          evidence: { source: "newsletter-signup-form" },
          originModule: "newsletter",
        },
      }),
    MemberNotFoundError
  );

  const found = await deps.consents.findByMemberAndPurpose({ workspaceId: WORKSPACE_ID, memberId: "no-such-member", purpose: PURPOSE });
  assert.equal(found, null);
});

test("T029/INV-NEW-02: confirmConsent transitions pending -> granted", async () => {
  const deps = makeDeps();
  await requestConsent({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE, evidence: { source: "form" }, originModule: "newsletter" },
  });

  const { consent } = await confirmConsent({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      memberId: MEMBER_ID,
      purpose: PURPOSE,
      evidence: { source: "confirm-click", confirmTokenId: "tok-1" },
      originModule: "newsletter",
    },
  });

  assert.equal(consent.status, "granted");
  assert.ok(consent.grantedAt);

  const revisions = await deps.consents.listRevisions({ workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE });
  assert.equal(revisions.length, 2);
  assert.equal(revisions[1].op, "consent_confirm");
});

test("T029/INV-NEW-02: confirmConsent with no prior requestConsent throws MemberNotFoundError and creates no row", async () => {
  const deps = makeDeps();

  await assert.rejects(
    () =>
      confirmConsent({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          memberId: MEMBER_ID,
          purpose: PURPOSE,
          evidence: { source: "confirm-click" },
          originModule: "newsletter",
        },
      }),
    MemberNotFoundError
  );

  const found = await deps.consents.findByMemberAndPurpose({ workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE });
  assert.equal(found, null);
  const revisions = await deps.consents.listRevisions({ workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE });
  assert.equal(revisions.length, 0);
});

test("confirmConsent on an already-granted purpose (no fresh pending request) throws MemberNotFoundError, never re-grants", async () => {
  const deps = makeDeps();
  await requestConsent({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE, evidence: { source: "form" }, originModule: "newsletter" },
  });
  await confirmConsent({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE, evidence: { source: "confirm" }, originModule: "newsletter" },
  });

  await assert.rejects(
    () =>
      confirmConsent({
        deps,
        input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE, evidence: { source: "confirm-again" }, originModule: "newsletter" },
      }),
    MemberNotFoundError
  );
});

test("T030: revokeConsent is idempotent — revoking an already-revoked purpose is a no-op", async () => {
  const deps = makeDeps();
  await requestConsent({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE, evidence: { source: "form" }, originModule: "newsletter" },
  });
  await confirmConsent({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE, evidence: { source: "confirm" }, originModule: "newsletter" },
  });

  const first = await revokeConsent({ deps, input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE } });
  assert.equal(first.consent.status, "revoked");
  const revisionsAfterFirst = await deps.consents.listRevisions({ workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE });
  assert.equal(revisionsAfterFirst.length, 3); // request, confirm, revoke

  const second = await revokeConsent({ deps, input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE } });
  assert.equal(second.consent.status, "revoked");
  assert.equal(second.consent.version, first.consent.version, "no-op must not bump version");

  const revisionsAfterSecond = await deps.consents.listRevisions({ workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE });
  assert.equal(revisionsAfterSecond.length, 3, "no-op revoke must not append a new revision row");
});

test("revokeConsent on a purpose with no prior consent record throws MemberNotFoundError", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => revokeConsent({ deps, input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE } }),
    MemberNotFoundError
  );
});

test("T031: checkConsent returns {status:'none'} (total function, never throws) when no row exists", async () => {
  const deps = makeDeps();
  const result = await checkConsent({ deps, input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE } });
  assert.deepEqual(result, { status: "none" });
});

test("T031: checkConsent reflects the current status once a request exists", async () => {
  const deps = makeDeps();
  await requestConsent({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE, evidence: { source: "form" }, originModule: "newsletter" },
  });
  const result = await checkConsent({ deps, input: { workspaceId: WORKSPACE_ID, memberId: MEMBER_ID, purpose: PURPOSE } });
  assert.deepEqual(result, { status: "pending" });
});
