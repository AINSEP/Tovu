import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { AssistantSurfaceDeps } from "../../../contracts/core/tool-surface-exchanges.js";
import { publishContentAgentToolCatalog, PUBLISH_CONTENT_CONNECT_TOOL_ID, PUBLISH_CONTENT_PUBLISH_TOOL_ID, PUBLISH_CONTENT_STATUS_TOOL_ID } from "../agent-tools.js";
import type { PublishContentPeerRecord } from "../peers.js";
import {
  countPublishChanges,
  describePublishChanges,
  describePublishResult,
  publishWouldChangeNothing,
  summarizeLeftAlone,
} from "../publish-confirmation-ui.js";
import { describePublishReadiness, siteLabelFor } from "../publish-readiness.js";
import type { PublishContentOutcomeRow } from "../planner.js";
import { buildPublishContentRegistrations, plainSentence, type PublishContentToolDeps } from "../tool-registrations.js";
import { registerPublishContentContributor, resetPublishContentContributorsForTests } from "../type-registry.js";

/**
 * @file The publishing tools' certification. Four things are proved here, in this order:
 *
 * 1. **Reachability, through the REAL composition manifest** — not "a registration object was
 *    built", but "`installFirstPartyToolContributors()`, the function both real boot paths call,
 *    puts these three ids in the catalog the daemon serves". This repo's dominant defect is a
 *    correct primitive with an unwired call site, and a tool nobody surfaces is exactly that.
 * 2. **The verdict**, over all four situations a source install can be in.
 * 3. **The vocabulary rule** — no sentence any of these tools can produce teaches a concept, and no
 *    machine token can reach a person. Asserted over every reachable string rather than spot-checked,
 *    mirroring `publish-trust/__tests__/provisioning.test.ts`'s identical guard.
 * 4. **The confirmation rule** — `publish_content_publish` refuses rather than publishing when there
 *    is no way to ask a person, and its catalog entry offers the model no argument that would skip
 *    the question.
 */

const WORKSPACE_ID = "ws-publish-tools";
const PRINCIPAL_ID = "principal-under-test";

/** Vocabulary this surface may never teach. Each is a real word from the machinery underneath. */
const FORBIDDEN_WORDS = [
  "key", "token", "grant", "principal", "capability", "credential", "workspace id",
  "installation", "generation", "peer", "bundle", "entity", "provision", "hkdf", "ed25519",
];

/** An identifier-shaped token — `PEER_NOT_FOUND`, `publish_trust_export_not_wired`. */
const MACHINE_TOKEN = /\b(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[a-z0-9]+(?:_[a-z0-9]+)+)\b/;

function assertReadableByAPerson(sentence: string, where: string): void {
  assert.equal(MACHINE_TOKEN.test(sentence), false, `${where} leaks a machine token: ${sentence}`);
  const lowered = sentence.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    assert.equal(lowered.includes(word), false, `${where} names '${word}': ${sentence}`);
  }
}

function peerRow(overrides: Partial<PublishContentPeerRecord>): PublishContentPeerRecord {
  return {
    workspaceId: WORKSPACE_ID,
    id: "dest-1",
    label: "example.com",
    baseUrl: "https://example.com",
    remoteWorkspaceId: "ws-remote",
    sealed: null,
    masked: null,
    aadVersion: 1,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

/** A deps bag with only what the read paths touch. The write paths are exercised through their own
 *  ports elsewhere; what is certified here is the decision, the wording and the refusals. */
function toolDeps(overrides: Partial<PublishContentToolDeps> = {}): PublishContentToolDeps {
  const rows: PublishContentPeerRecord[] = [];
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true }),
    clock: { nowIso: () => "2026-09-19T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    postRepo: null as never,
    pluginBeforeSaveHook: undefined as never,
    outbox: null as never,
    mediaRepo: null as never,
    assetBlobRepo: null as never,
    blobStore: null as never,
    workspaceRepo: { findById: async () => ({ name: "Test Site" }) },
    publishContentPeerRepo: {
      listByWorkspace: async () => rows,
      insert: async () => undefined as never,
      update: async () => undefined as never,
      findById: async () => null,
      delete: async () => undefined,
    } as unknown as PublishContentToolDeps["publishContentPeerRepo"],
    publishContentPeerHttpClient: null as never,
    siteAssistantSecretSealer: null as never,
    siteAssistantSecretKeyring: null as never,
    findPublishCandidate: async () => null,
    publishTrustProvisioning: null as never,
    ...overrides,
  };
}

const NO_SURFACES: AssistantSurfaceDeps = {
  surfaceExchanges: { open: () => { throw new Error("not used in this test"); } },
} as unknown as AssistantSurfaceDeps;

function registrationFor(deps: PublishContentToolDeps, toolId: string): ToolRegistration {
  const found = buildPublishContentRegistrations(deps, NO_SURFACES).find((r) => r.descriptor.id === toolId);
  assert.ok(found, `${toolId} was not built`);
  return found;
}

function execContext(input: unknown, extra: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    ...extra,
  } as ToolExecutionContext;
}

// ---------------------------------------------------------------------------
// 1. Reachability — through the real manifest both boot paths call
// ---------------------------------------------------------------------------

test("the three tools reach the catalog the daemon serves, via the real composition manifest", async () => {
  const { resetToolContributorsForTests, listToolContributors } = await import("../../../assistant/tool-contribution-registry.js");
  const { installFirstPartyToolContributors } = await import("../../../server/runtime/composition/tool-catalog-manifest.js");

  resetToolContributorsForTests();
  // Positive control: nothing is installed until the manifest runs, so a pass below cannot be an
  // artifact of some earlier import having registered these for us.
  assert.equal(listToolContributors().length, 0);

  installFirstPartyToolContributors();

  const contributor = listToolContributors().find((c) => c.domain === "publish-content");
  assert.ok(contributor, "installFirstPartyToolContributors() did not install publish-content");

  const ids = contributor.build(toolDeps() as never, NO_SURFACES).map((r) => r.descriptor.id);
  assert.deepEqual(
    [...ids].sort(),
    [PUBLISH_CONTENT_CONNECT_TOOL_ID, PUBLISH_CONTENT_PUBLISH_TOOL_ID, PUBLISH_CONTENT_STATUS_TOOL_ID].sort()
  );

  // Every wired tool must carry a risk classification, or `assertRiskMetadataIsWirable` refuses the
  // whole catalog at boot — the gate that turns a missing entry into a dead assistant, not a quiet gap.
  for (const id of ids) assert.ok(contributor.risk.has(id), `${id} has no risk classification`);
});

// ---------------------------------------------------------------------------
// 2. The verdict
// ---------------------------------------------------------------------------

test("a connected computer is ready", () => {
  const r = describePublishReadiness({ connectedSiteLabel: "example.com", otherSiteLabels: [], candidateUrl: null, publishableTypeCount: 2 });
  assert.equal(r.ready, true);
  assert.equal(r.verdict, "ready");
  assert.equal(r.summary, "This computer publishes to example.com.");
  assert.equal(r.nextStep, null);
});

test("a hand-configured destination counts as ready too — it is the same capability", () => {
  const r = describePublishReadiness({ connectedSiteLabel: null, otherSiteLabels: ["a.com", "b.com"], candidateUrl: null, publishableTypeCount: 2 });
  assert.equal(r.ready, true);
  assert.equal(r.summary, "This computer publishes to a.com and b.com.");
});

test("a live site exists but this computer was never connected to it", () => {
  const r = describePublishReadiness({ connectedSiteLabel: null, otherSiteLabels: [], candidateUrl: "https://example.com/x", publishableTypeCount: 2 });
  assert.equal(r.ready, false);
  assert.equal(r.verdict, "not-connected");
  assert.match(r.summary, /example\.com/);
  assert.match(r.nextStep ?? "", /^Connect this computer to example\.com/);
});

test("the never-deployed install is an empty state, not a fault", () => {
  const r = describePublishReadiness({ connectedSiteLabel: null, otherSiteLabels: [], candidateUrl: null, publishableTypeCount: 2 });
  assert.equal(r.ready, false);
  assert.equal(r.verdict, "no-live-site");
  assert.equal(r.summary, "There is no live site to publish to yet.");
  assert.ok(r.nextStep);
});

test("nothing publishable is checked BEFORE connectedness — it blocks the thing actually asked about", () => {
  const r = describePublishReadiness({ connectedSiteLabel: "example.com", otherSiteLabels: [], candidateUrl: null, publishableTypeCount: 0 });
  assert.equal(r.ready, false);
  assert.equal(r.verdict, "nothing-publishable");
});

test("siteLabelFor is the host, and an unparseable address does not throw", () => {
  assert.equal(siteLabelFor("https://example.com/a/b"), "example.com");
  assert.equal(siteLabelFor("not a url"), "not a url");
});

// ---------------------------------------------------------------------------
// 3. The vocabulary rule
// ---------------------------------------------------------------------------

test("no verdict this function can produce teaches a concept or leaks a code", () => {
  const cases = [
    { connectedSiteLabel: "example.com", otherSiteLabels: [], candidateUrl: null, publishableTypeCount: 2 },
    { connectedSiteLabel: null, otherSiteLabels: ["a.com"], candidateUrl: null, publishableTypeCount: 2 },
    { connectedSiteLabel: null, otherSiteLabels: [], candidateUrl: "https://example.com", publishableTypeCount: 2 },
    { connectedSiteLabel: null, otherSiteLabels: [], candidateUrl: null, publishableTypeCount: 2 },
    { connectedSiteLabel: null, otherSiteLabels: [], candidateUrl: null, publishableTypeCount: 0 },
  ];
  for (const input of cases) {
    const r = describePublishReadiness(input);
    for (const [field, value] of Object.entries({ summary: r.summary, missing: r.missing, nextStep: r.nextStep })) {
      if (typeof value === "string") assertReadableByAPerson(value, `${r.verdict}.${field}`);
    }
  }
});

test("plainSentence passes a person's sentence through and discards one carrying a machine token", () => {
  assert.equal(plainSentence("The site could not be reached.", "fallback"), "The site could not be reached.");
  assert.equal(plainSentence("refused: PEER_NOT_FOUND", "fallback"), "fallback");
  assert.equal(plainSentence("reason publish_trust_export_not_wired", "fallback"), "fallback");
  assert.equal(plainSentence("   ", "fallback"), "fallback");
  // A capitalised site name is ordinary prose and must survive.
  assert.equal(plainSentence("Example Site is offline.", "fallback"), "Example Site is offline.");
});

test("every sentence the change summary can produce is readable by a person", () => {
  const shapes = [
    { added: 0, replaced: 0, unchanged: 3, skipped: 0 },
    { added: 0, replaced: 0, unchanged: 0, skipped: 2 },
    { added: 1, replaced: 0, unchanged: 0, skipped: 0 },
    { added: 4, replaced: 2, unchanged: 1, skipped: 3 },
  ];
  for (const counts of shapes) assertReadableByAPerson(describePublishChanges(counts, "example.com"), "describePublishChanges");
});

test("describePublishResult speaks in the past tense and mentions what was already up to date", () => {
  assert.equal(
    describePublishResult({ added: 0, replaced: 0, unchanged: 0, skipped: 0 }, "example.com"),
    "example.com was already up to date."
  );
  assert.equal(
    describePublishResult({ added: 0, replaced: 0, unchanged: 0, skipped: 2 }, "example.com"),
    "Nothing changed on example.com. 2 things were left alone."
  );
  assert.equal(
    describePublishResult({ added: 0, replaced: 0, unchanged: 5, skipped: 0 }, "example.com"),
    "Nothing changed on example.com. 5 things were already up to date."
  );
  assert.equal(
    describePublishResult({ added: 0, replaced: 0, unchanged: 3, skipped: 2 }, "example.com"),
    "Nothing changed on example.com. 3 things were already up to date, and 2 things were left alone."
  );
  assert.equal(
    describePublishResult({ added: 1, replaced: 0, unchanged: 0, skipped: 0 }, "example.com"),
    "Published to example.com: added 1 thing."
  );
  assert.equal(
    describePublishResult({ added: 2, replaced: 1, unchanged: 3, skipped: 0 }, "example.com"),
    "Published to example.com: added 2 things and replaced 1 thing. 3 things were already up to date."
  );
  assert.equal(
    describePublishResult({ added: 2, replaced: 1, unchanged: 3, skipped: 4 }, "example.com"),
    "Published to example.com: added 2 things and replaced 1 thing. 3 things were already up to date, and 4 things were left alone."
  );
});

test("every sentence describePublishResult can produce is readable by a person", () => {
  const shapes = [
    { added: 0, replaced: 0, unchanged: 0, skipped: 0 },
    { added: 0, replaced: 0, unchanged: 0, skipped: 2 },
    { added: 0, replaced: 0, unchanged: 5, skipped: 0 },
    { added: 0, replaced: 0, unchanged: 3, skipped: 2 },
    { added: 4, replaced: 2, unchanged: 1, skipped: 3 },
  ];
  for (const counts of shapes) assertReadableByAPerson(describePublishResult(counts, "example.com"), "describePublishResult");
});

// ---------------------------------------------------------------------------
// 3a. summarizeLeftAlone — grouping the conflict/blocked rows by why publishing left them alone
// ---------------------------------------------------------------------------

function leftAloneRow(overrides: Partial<PublishContentOutcomeRow>): PublishContentOutcomeRow {
  return { entityType: "post", entityId: "e", entityLabel: null, outcome: "blocked", writes: false, reason: null, ...overrides };
}

test("summarizeLeftAlone groups skipped rows by reason, in a fixed order, with a plain sentence per group", () => {
  const rows: PublishContentOutcomeRow[] = [
    // Applied/created/unchanged rows are not "left alone" and must not appear in any group.
    { entityType: "post", entityId: "p1", entityLabel: "Home", outcome: "created", writes: true, reason: null },
    { entityType: "post", entityId: "p2", entityLabel: "News", outcome: "applied", writes: true, reason: null },
    { entityType: "post", entityId: "p3", entityLabel: "Old", outcome: "forced", writes: true, reason: "conflict" },
    { entityType: "post", entityId: "p4", entityLabel: "Same", outcome: "unchanged", writes: false, reason: null },

    leftAloneRow({
      entityId: "about",
      entityLabel: "About",
      outcome: "conflict",
      reason: "post 'about' has been edited on the destination since the last sync with this peer",
    }),
    leftAloneRow({
      entityId: "faq",
      entityLabel: "FAQ",
      outcome: "conflict",
      reason: "post 'faq' has been edited on the destination since the last sync with this peer",
    }),
    leftAloneRow({
      entityId: "docs",
      entityLabel: "Docs",
      outcome: "conflict",
      reason: "no prior sync baseline for post 'docs' with this peer — the destination already holds different content",
    }),
    leftAloneRow({
      entityId: "about",
      entityLabel: "About",
      outcome: "blocked",
      reason:
        "post 'about' is 'html'-format at this destination but 'doc'-format at the source — publishing cannot convert a body format without discarding a whole body",
    }),
    leftAloneRow({
      entityId: "menu-header-nav",
      entityLabel: null,
      outcome: "blocked",
      reason: "no registered publish-content handler for entity type 'menu' on this instance",
    }),
    leftAloneRow({
      entityId: "hero-image",
      entityLabel: "Hero image",
      outcome: "blocked",
      reason: "required blob 'abc123' is not available on this instance",
    }),
    leftAloneRow({
      entityId: "mystery",
      entityLabel: "Mystery",
      outcome: "invented" as never,
      reason: null,
    }),
  ];

  const groups = summarizeLeftAlone(rows);

  assert.deepEqual(
    groups.map((g) => g.reasonClass),
    ["edited-on-live", "no-baseline", "body-format", "type-not-supported-by-live", "blob-missing", "other"]
  );

  const byClass = new Map(groups.map((g) => [g.reasonClass, g]));

  assert.deepEqual(byClass.get("edited-on-live"), {
    reasonClass: "edited-on-live",
    count: 2,
    sentence: "2 things were edited on the live site since the last publish, so publishing left them alone.",
    entityLabels: ["About", "FAQ"],
  });
  assert.deepEqual(byClass.get("no-baseline"), {
    reasonClass: "no-baseline",
    count: 1,
    sentence:
      "1 thing on the live site was never published from this computer before, so publishing left it alone rather than overwrite something already there.",
    entityLabels: ["Docs"],
  });
  assert.deepEqual(byClass.get("body-format"), {
    reasonClass: "body-format",
    count: 1,
    sentence: "1 thing was edited in a different way locally than on the live site, so publishing cannot carry the change over yet.",
    entityLabels: ["About"],
  });
  assert.deepEqual(byClass.get("type-not-supported-by-live"), {
    reasonClass: "type-not-supported-by-live",
    count: 1,
    sentence: "1 thing was a kind of content the live site cannot receive yet.",
    entityLabels: ["menu-header-nav"],
  });
  assert.deepEqual(byClass.get("blob-missing"), {
    reasonClass: "blob-missing",
    count: 1,
    sentence: "1 thing was missing a file this computer could not find to send.",
    entityLabels: ["Hero image"],
  });
  assert.deepEqual(byClass.get("other"), {
    reasonClass: "other",
    count: 1,
    sentence: "1 thing was left alone.",
    entityLabels: ["Mystery"],
  });

  for (const group of groups) assertReadableByAPerson(group.sentence, `summarizeLeftAlone.${group.reasonClass}`);
});

test("summarizeLeftAlone caps each group's entity labels at 5 but keeps the true count", () => {
  const rows: PublishContentOutcomeRow[] = ["A", "B", "C", "D", "E", "F"].map((label, i) =>
    leftAloneRow({
      entityId: `p${i}`,
      entityLabel: label,
      outcome: "conflict",
      reason: `post 'p${i}' has been edited on the destination since the last sync with this peer`,
    })
  );

  const groups = summarizeLeftAlone(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.count, 6);
  assert.deepEqual(groups[0]?.entityLabels, ["A", "B", "C", "D", "E"]);
});

test("summarizeLeftAlone returns no groups when nothing was left alone", () => {
  assert.deepEqual(summarizeLeftAlone([]), []);
});

// ---------------------------------------------------------------------------
// 4. Counting, and the confirmation rule
// ---------------------------------------------------------------------------

function row(outcome: PublishContentOutcomeRow["outcome"]): PublishContentOutcomeRow {
  return { entityType: "post", entityId: "e", outcome, writes: true, reason: null };
}

test("every outcome kind lands in exactly one bucket, and the buckets total the rows", () => {
  const rows = [row("created"), row("created"), row("applied"), row("forced"), row("unchanged"), row("conflict"), row("blocked")];
  const counts = countPublishChanges(rows);
  assert.deepEqual(counts, { added: 2, replaced: 2, unchanged: 1, skipped: 2 });
  assert.equal(counts.added + counts.replaced + counts.unchanged + counts.skipped, rows.length);
});

test("an outcome kind nobody has seen before counts as left-alone, never as silently dropped", () => {
  const counts = countPublishChanges([{ entityType: "post", entityId: "e", outcome: "invented" as never, writes: false, reason: null }]);
  assert.deepEqual(counts, { added: 0, replaced: 0, unchanged: 0, skipped: 1 });
});

test("a plan that writes nothing is not a change", () => {
  assert.equal(publishWouldChangeNothing({ added: 0, replaced: 0, unchanged: 5, skipped: 2 }), true);
  assert.equal(publishWouldChangeNothing({ added: 0, replaced: 1, unchanged: 0, skipped: 0 }), false);
});

test("publishing refuses rather than proceeding when there is no way to ask a person", async () => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => null as never });

  const deps = toolDeps({
    // A real blob store, so that the ONLY thing standing between this call and a live write is the
    // missing way to ask a person. Without it the blob-store guard refuses first and this test
    // passes for the wrong reason — which is exactly what a deliberate break caught.
    blobStore: {} as never,
    publishContentPeerRepo: {
      listByWorkspace: async () => [peerRow({})],
      insert: async () => undefined as never,
      update: async () => undefined as never,
      findById: async () => null,
      delete: async () => undefined,
    } as unknown as PublishContentToolDeps["publishContentPeerRepo"],
  });

  // No `emitSurface` — a background or scripted run. Publishing unattended is the one outcome this
  // tool must never produce, so it fails closed.
  await assert.rejects(
    () => registrationFor(deps, PUBLISH_CONTENT_PUBLISH_TOOL_ID).handler(execContext({})),
    (err: Error) => {
      // The EXACT refusal, not merely "something said nothing was published": three other guards in
      // this handler end with that same phrase, and any of them would mask this one.
      assert.equal(
        err.message,
        "Publishing needs someone present to say yes before anything is written to the live site, " +
          "and this session has no way to ask them. Nothing was published."
      );
      assertReadableByAPerson(err.message, "publish refusal");
      return true;
    }
  );
});

test("publishing reports the readiness verdict instead of attempting a publish that cannot work", async () => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => null as never });

  const result = (await registrationFor(toolDeps(), PUBLISH_CONTENT_PUBLISH_TOOL_ID).handler(execContext({}))) as Record<string, unknown>;
  assert.equal(result.published, false);
  assert.equal(result.verdict, "no-live-site");
});

test("the catalog offers the model no argument that would skip the human's answer", () => {
  const publish = publishContentAgentToolCatalog.find((t) => t.name === PUBLISH_CONTENT_PUBLISH_TOOL_ID);
  assert.ok(publish);
  const schema = publish.inputSchema as { additionalProperties?: boolean; properties?: Record<string, unknown> };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties ?? {}), []);
});

test("the status tool reads and the write tools do not claim to be read-only", () => {
  const byId = new Map(publishContentAgentToolCatalog.map((t) => [t.name, t]));
  assert.equal(byId.get(PUBLISH_CONTENT_STATUS_TOOL_ID)?.sideEffects, "none");
  assert.equal(byId.get(PUBLISH_CONTENT_STATUS_TOOL_ID)?.authorization.permission, "publish_content.read");
  assert.equal(byId.get(PUBLISH_CONTENT_CONNECT_TOOL_ID)?.sideEffects, "mutates-durable-state");
  assert.equal(byId.get(PUBLISH_CONTENT_CONNECT_TOOL_ID)?.authorization.permission, "publish_content.apply");
  assert.equal(byId.get(PUBLISH_CONTENT_PUBLISH_TOOL_ID)?.sideEffects, "mutates-durable-state");
  assert.equal(byId.get(PUBLISH_CONTENT_PUBLISH_TOOL_ID)?.authorization.permission, "publish_content.apply");
});

test("the status tool answers the never-connected install in plain sentences", async () => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => null as never });

  const result = (await registrationFor(toolDeps({ findPublishCandidate: async () => "https://example.com" }), PUBLISH_CONTENT_STATUS_TOOL_ID).handler(
    execContext({})
  )) as Record<string, unknown>;

  assert.equal(result.ready, false);
  assert.equal(result.verdict, "not-connected");
  for (const field of ["summary", "missing", "nextStep"]) {
    assertReadableByAPerson(String(result[field]), `status.${field}`);
  }
});

test("connect refuses plainly when there is no live site to connect to, rather than throwing", async () => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => null as never });

  const result = (await registrationFor(toolDeps(), PUBLISH_CONTENT_CONNECT_TOOL_ID).handler(execContext({}))) as Record<string, unknown>;
  assert.equal(result.connected, false);
  assertReadableByAPerson(String(result.message), "connect.message");
  assertReadableByAPerson(String(result.nextStep), "connect.nextStep");
});

test("connect refuses an address that is not one, without naming a validation rule", async () => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => null as never });

  const result = (await registrationFor(toolDeps(), PUBLISH_CONTENT_CONNECT_TOOL_ID).handler(
    execContext({ siteUrl: "definitely not a url" })
  )) as Record<string, unknown>;
  assert.equal(result.connected, false);
  assert.equal(result.message, "That does not look like a website address.");
});

test("connect refuses an install with nothing publishable rather than connecting it to nothing", async () => {
  resetPublishContentContributorsForTests();

  const result = (await registrationFor(toolDeps(), PUBLISH_CONTENT_CONNECT_TOOL_ID).handler(
    execContext({ siteUrl: "https://example.com" })
  )) as Record<string, unknown>;
  assert.equal(result.connected, false);
  assertReadableByAPerson(String(result.message), "connect.nothing-publishable");
});

test("publishing refuses when this site cannot send its images and files, rather than leaving them behind", async () => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => null as never });

  const deps = toolDeps({
    publishContentPeerRepo: {
      listByWorkspace: async () => [peerRow({})],
      insert: async () => undefined as never,
      update: async () => undefined as never,
      findById: async () => null,
      delete: async () => undefined,
    } as unknown as PublishContentToolDeps["publishContentPeerRepo"],
  });

  await assert.rejects(
    () => registrationFor(deps, PUBLISH_CONTENT_PUBLISH_TOOL_ID).handler(execContext({}, { emitSurface: async () => undefined })),
    (err: Error) => {
      assert.match(err.message, /^This site is not set up to send its images and files/);
      assertReadableByAPerson(err.message, "blob-store refusal");
      return true;
    }
  );
});
