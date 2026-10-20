import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { processOutbox } from "#src/contracts/core/events/index";
import { createApp } from "../app.js";
import {
  awaitNewPlan, bootSite, deliveryJobs, FakePushDestinations, FakeReceiver, FORM_ID, installFixtureHook, installFixturePlugin,
  isolateSiteEnvironment, outboxRows, plannedSubmissions, PUSH_A, PUSH_B, removeSiteDir, seedSite, writeBindings, type FixtureSite,
} from "./form-delivery-vertical-slice.fixture.js";

/**
 * @file Permanent deletion versus durable delivery, through the real site composition: purging a
 * submission (or its whole form) from the Trash blanks the answers frozen into its delivery jobs'
 * outbox rows and fails the jobs that have not finished, so nothing delivers them afterwards.
 * Copies a destination already received stay there; only Tovu's own frozen copies are scrubbed.
 */

const T0 = "2030-01-01T00:00:00.000Z";
const OWNER = { principalId: "owner" };

describe("form delivery after a permanent delete", () => {
  let dir = "";
  let home = "";
  const receiver = new FakeReceiver();
  const destinations = new FakePushDestinations();
  const clock = createFakeClock({ startIso: T0 });
  let site: FixtureSite;
  let restoreEnv = (): void => undefined;
  let removeHook = (): void => undefined;

  const drain = () => processOutbox({ outbox: site.deps.outbox, bus: site.deps.bus, clock }, { random: () => 0 });
  const pullOne = async (remoteId: string, answers: Record<string, string>): Promise<string> => {
    const known = await plannedSubmissions({ kernel: site.kernel });
    receiver.add({ id: remoteId, answers, submittedAt: "2026-10-20T09:00:00.000Z" });
    await site.deps.formSubmissionsPull!.pull({ workspaceId: site.deps.workspaceId });
    return awaitNewPlan({ kernel: site.kernel, known });
  };
  /** Moves the entity to the Trash, then purges it as a confirmed owner would. */
  const purge = async (entityType: "form" | "form_submission", entityId: string): Promise<void> => {
    const { trash, workspaceId } = site.deps;
    const at = new Date().toISOString();
    const hidden = await trash.trash({ workspaceId, entityType, entityId, actor: OWNER, display: { title: "purged in a test" }, at, expectedVersion: null });
    assert.equal(hidden.ok, true, `${entityType} ${entityId} went to the Trash`);
    const listed = await trash.list({ workspaceId, now: at, limit: 50 });
    const item = listed.items.find((entry) => entry.entityType === entityType && entry.entityId === entityId);
    assert.ok(item, "the Trash lists it");
    const report = await trash.purgeSelected({ workspaceId, ids: [item.id], actor: OWNER, authorizeItem: async () => true });
    assert.deepEqual(report.results.map((result) => result.outcome), ["purged"]);
  };
  const rowsMentioning = async (text: string) => (await outboxRows({ kernel: site.kernel })).filter((row) => row.eventJson.includes(text)).map((row) => row.event.name);

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-delivery-purge-"));
    home = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-delivery-purge-home-"));
    restoreEnv = isolateSiteEnvironment({ home });
    removeHook = installFixtureHook({ receiver, destinations });
    site = await bootSite({ dir });
    await installFixturePlugin({ deps: site.deps });
    const connections = await seedSite({ deps: site.deps });
    await writeBindings({ deps: site.deps, bindings: [
      { bindingId: "binding-a", adapterId: PUSH_A, connectionRef: connections.connectionA, enabled: true, config: { table: "leads" } },
      { bindingId: "binding-b", adapterId: PUSH_B, connectionRef: connections.connectionB, enabled: true, formIds: [FORM_ID], config: { sheet: "Leads" } },
    ] });
    createApp(site.deps);
  });

  after(async () => {
    try {
      await site?.close();
    } finally {
      removeHook();
      restoreEnv();
      if (dir) await removeSiteDir({ dir });
      if (home) fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("purging a submission blanks its frozen answers and fails its unfinished job, which never delivers", async () => {
    const answer = "purge-me@example.com";
    const submissionId = await pullOne("remote-1", { email: answer, message: "private words" });
    destinations.script({ adapterId: PUSH_B, submissionId, results: [{ ok: false, error: { code: "rate-limited", retryable: true } }] });
    assert.equal(await drain(), 2);

    await purge("form_submission", submissionId);

    assert.deepEqual(await rowsMentioning(answer), [], "no outbox row keeps the answer");
    assert.deepEqual(await rowsMentioning("private words"), []);
    const jobs = await deliveryJobs({ kernel: site.kernel, submissionId });
    assert.deepEqual(jobs.map((row) => [row.job.binding.bindingId, row.status, row.job.snapshot.submission.answers]),
      [["binding-a", "delivered", {}], ["binding-b", "failed", {}]]);
    const status = await site.deps.formDeliveryStatus!.forSubmission({ workspaceId: site.deps.workspaceId, submissionId });
    assert.deepEqual(status.map((row) => [row.bindingId, row.status, row.errorCode]), [["binding-a", "completed", null], ["binding-b", "failed", "delivery-failed"]]);

    const calls = destinations.calls.length;
    clock.advanceMs(24 * 60 * 60_000);
    assert.equal(await drain(), 0, "nothing is due any more");
    assert.equal(destinations.calls.length, calls, "the failed job was never delivered again");
  });

  test("purging a form does the same for every submission it had", async () => {
    const answer = "form-purge@example.com";
    const submissionId = await pullOne("remote-2", { email: answer, message: "more private words" });

    await purge("form", FORM_ID);

    assert.deepEqual(await rowsMentioning(answer), []);
    assert.deepEqual((await deliveryJobs({ kernel: site.kernel, submissionId })).map((row) => [row.status, row.job.snapshot.submission.answers]),
      [["failed", {}], ["failed", {}]]);
  });
});
