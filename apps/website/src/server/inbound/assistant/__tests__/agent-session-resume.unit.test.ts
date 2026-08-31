import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  extractSessionRefFromEndEvent,
  resolveResumeSessionField,
  shouldClearSessionOnFailedResume,
} from "../agent-session-resume.js";

/**
 * @file `agent-daemon-server.ts` cannot be imported directly by a unit test (import-time side
 * effects — see `plugin-prompt-prefix.unit.test.ts`'s identical note). These two functions were
 * extracted specifically so the session-resume decision logic `onStarted` runs is directly
 * testable without booting the daemon or spawning a real agent CLI.
 *
 * `RunProtocolEvent` (the real wire type these fixtures mimic) is `@jini-ai/protocol`'s, a package
 * Tovu has no direct dependency on — see `agent-session-resume.ts`'s own doc on why it derives that
 * type structurally instead of importing it by name. This file follows the same rule: `event`'s
 * type below is inferred from `extractSessionRefFromEndEvent`'s own parameter, not re-imported.
 */

type SessionEndEvent = Parameters<typeof extractSessionRefFromEndEvent>[0];

/** A minimally-valid event of the given kind/payload — every other envelope field is inert for
 * these two functions, which only ever branch on `kind` and read `payload`. */
function makeEvent<Kind extends SessionEndEvent["kind"]>(
  kind: Kind,
  payload: Extract<SessionEndEvent, { kind: Kind }>["payload"],
): SessionEndEvent {
  return {
    runId: "run-1",
    eventId: "run-1:0",
    opaqueCursor: "0",
    protocolVersion: 1,
    ts: 0,
    kind,
    payload,
    durability: "durable",
  } as SessionEndEvent;
}

describe("resolveResumeSessionField", () => {
  test("returns an empty object for a null stored session id (no prior turn to resume)", () => {
    assert.deepEqual(resolveResumeSessionField(null), {});
  });

  test("returns { resumeSessionId } for a stored session id", () => {
    assert.deepEqual(resolveResumeSessionField("sess-abc"), { resumeSessionId: "sess-abc" });
  });
});

describe("extractSessionRefFromEndEvent", () => {
  test("returns undefined for a non-'end' event, even one that happens to carry a similarly-shaped field", () => {
    const event = makeEvent("agent", { type: "status", label: "thinking" });
    assert.equal(extractSessionRefFromEndEvent(event), undefined);
  });

  test("returns undefined for an 'end' event with no sessionRef (a def with no resumesSessionViaCli support)", () => {
    const event = makeEvent("end", { code: 0, signal: null, status: "succeeded" });
    assert.equal(extractSessionRefFromEndEvent(event), undefined);
  });

  test("returns undefined for an 'end' event with an empty-string sessionRef", () => {
    const event = makeEvent("end", { code: 0, signal: null, status: "succeeded", sessionRef: "" });
    assert.equal(extractSessionRefFromEndEvent(event), undefined);
  });

  test("returns the sessionRef for a terminal 'end' event that carries one", () => {
    const event = makeEvent("end", { code: 0, signal: null, status: "succeeded", sessionRef: "sess-from-cli" });
    assert.equal(extractSessionRefFromEndEvent(event), "sess-from-cli");
  });

  test("returns the sessionRef even for a failed run that still reported a resumable session", () => {
    const event = makeEvent("end", { code: 1, signal: null, status: "failed", resumable: true, sessionRef: "sess-from-cli" });
    assert.equal(extractSessionRefFromEndEvent(event), "sess-from-cli");
  });
});

describe("shouldClearSessionOnFailedResume", () => {
  /**
   * @file H1 regression cover. Before `shouldClearSessionOnFailedResume` existed, `onStarted`'s
   * stream subscription had exactly one branch: capture a fresh `sessionRef` on `end`, or do
   * nothing. A resume that failed before the CLI ever reported one (e.g. the daemon restarting
   * from a different cwd — a known hazard in this repo) fell into "do nothing", leaving the dead
   * stored id in place forever: every later turn retried the identical `--resume <deadId>` and
   * failed the same way, with no recovery short of hand-editing the database. This suite proves
   * the decision that fixes that; the wiring that actually calls `AgentSessionStore.clearSessionId`
   * off this decision is covered separately by
   * `agent-daemon-server.session-resume-wiring.unit.test.ts` (a source-presence proof, since
   * `agent-daemon-server.ts` cannot be imported directly by a unit test — see this file's own
   * header).
   */

  test("true: this run attempted a resume, reached its terminal end event, and the CLI never reconfirmed a session id", () => {
    const event = makeEvent("end", { code: 1, signal: null, status: "failed", resumable: false });
    assert.equal(shouldClearSessionOnFailedResume(event, "sess-dead"), true);
  });

  test("false: this run never attempted a resume (cold first turn) — nothing was stored to protect", () => {
    const event = makeEvent("end", { code: 1, signal: null, status: "failed", resumable: false });
    assert.equal(shouldClearSessionOnFailedResume(event, null), false);
  });

  test("false: the end event DID carry a sessionRef — the resume succeeded (or reconfirmed), nothing dead to clear", () => {
    const event = makeEvent("end", { code: 0, signal: null, status: "succeeded", sessionRef: "sess-from-cli" });
    assert.equal(shouldClearSessionOnFailedResume(event, "sess-dead"), false);
  });

  test("false: not a terminal end event — a mid-run progress event says nothing about whether the resume ultimately failed", () => {
    const event = makeEvent("agent", { type: "status", label: "thinking" });
    assert.equal(shouldClearSessionOnFailedResume(event, "sess-dead"), false);
  });
});
