import "../../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { type FormDeliveryBinding, type FormDeliveryPlan, planFormDeliveries } from "@jini-ai/cms/forms";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "../../content-kernel.js";
import { SqlFormDeliveryRepo, SqlFormPullLeaseRepo } from "../form-delivery-repo.js";
import { SqlOutboxAdapter } from "../outbox-repo.js";

/**
 * @file Security pins for form delivery persistence (migration 0019) on SQLite and PGlite:
 * workspace isolation of plans, status reads and pull leases; status reads expose only
 * allowlisted error codes; a pull lease can only be released by the token that holds it.
 * Plan-once/replay/child-job behaviour is proven by the delivery vertical slice, not here.
 */

const T0 = "2026-10-20T12:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

function binding(bindingId: string): FormDeliveryBinding {
  return { bindingId, adapterId: `adapter-${bindingId}`, connectionRef: `conn-${bindingId}`, enabled: true, config: {} };
}

/** A real plan from the Jini planner, so the stored rows have the shape production writes. */
function plan(make: { repo: SqlFormDeliveryRepo }, workspaceId: string, bindingIds: readonly string[]): Promise<FormDeliveryPlan> {
  let next = 0;
  return planFormDeliveries({
    workspaceId, submissionId: "s1", formId: `form-${workspaceId}`,
    deps: {
      plans: make.repo,
      bindings: async () => bindingIds.map(binding),
      snapshot: async () => ({ form: { slug: "contact", fields: [{ name: "email", required: true }] },
        submission: { id: "s1", answers: { email: "a@example.com" }, submittedAt: T0 } }),
      newId: () => `${workspaceId}-job-${(next += 1)}`,
      nowIso: () => T0,
    },
  });
}

describeEachDialect(
  "form delivery repo security",
  {
    tables: ["form_delivery_plans", "form_delivery_jobs", "form_receiver_pulls", "outbox_events"],
    make: (kernel: ContentKernel) => ({ kernel, repo: new SqlFormDeliveryRepo({ kernel }), leases: new SqlFormPullLeaseRepo({ kernel }), outbox: new SqlOutboxAdapter(kernel) }),
  },
  (make) => {
    test("a plan for workspace B never returns or reuses workspace A's plan for the same submission id", async () => {
      const ctx = make();
      const a = await plan(ctx, "wa", ["b1"]);
      const b = await plan(ctx, "wb", ["b2", "b3"]);
      assert.equal(b.workspaceId, "wb");
      assert.deepEqual(b.jobs.map(job => [job.id, job.workspaceId]), [["wb-job-1", "wb"], ["wb-job-2", "wb"]]);
      const replayA = await ctx.repo.once({ workspaceId: "wa", submissionId: "s1", build: () => Promise.reject(new Error("must not rebuild")) });
      assert.deepEqual(replayA, a, "workspace A still reads its own stored plan");
    });

    /** Each job row of `workspaceId`: id, outbox status, last error and the frozen answers. */
    const jobRows = async (ctx: { kernel: ContentKernel }, workspaceId: string) =>
      (await ctx.kernel.run(db => db.selectFrom("outbox_events").select(["id", "status", "last_error", "event_json"]).where("workspace_id", "=", workspaceId).orderBy("id").execute()))
        .map(row => [row.id, row.status, row.last_error, (JSON.parse(row.event_json) as { payload: { snapshot: { submission: { answers: unknown } } } }).payload.snapshot.submission.answers]);

    test("a purged submission's jobs lose their answers and the unfinished ones fail, in its own workspace only", async () => {
      const ctx = make();
      await plan(ctx, "wa", ["b1", "b2"]);
      await plan(ctx, "wb", ["b3"]);
      await ctx.outbox.markDelivered({ id: "wa-job-1" });
      await ctx.repo.scrubPurged({ workspaceId: "wa", purged: { submissionId: "s1" } });
      assert.deepEqual(await jobRows(ctx, "wa"), [["wa-job-1", "delivered", null, {}], ["wa-job-2", "failed", "delivery-failed", {}]]);
      assert.deepEqual(await jobRows(ctx, "wb"), [["wb-job-1", "pending", null, { email: "a@example.com" }]], "the same submission id in another workspace is untouched");
    });

    test("a purged form scrubs the jobs of every submission planned for it", async () => {
      const ctx = make();
      await plan(ctx, "wa", ["b1"]);
      await plan(ctx, "wb", ["b3"]);
      await ctx.repo.scrubPurged({ workspaceId: "wb", purged: { formId: "form-wb" } });
      assert.deepEqual(await jobRows(ctx, "wb"), [["wb-job-1", "failed", "delivery-failed", {}]]);
      assert.deepEqual(await jobRows(ctx, "wa"), [["wa-job-1", "pending", null, { email: "a@example.com" }]]);
    });

    test("status reads for workspace B list only workspace B's jobs", async () => {
      const ctx = make();
      await plan(ctx, "wa", ["b1"]);
      await plan(ctx, "wb", ["b2"]);
      const bySubmission = await ctx.repo.forSubmission({ workspaceId: "wb", submissionId: "s1" });
      assert.deepEqual(bySubmission, [{ bindingId: "b2", adapterId: "adapter-b2", formId: "form-wb", submissionId: "s1",
        status: "pending", attempts: 0, nextRetryAt: null, errorCode: null }]);
      assert.deepEqual((await ctx.repo.recentUnfinished({ workspaceId: "wb" })).map(row => row.bindingId), ["b2"]);
      assert.deepEqual(await ctx.repo.forSubmission({ workspaceId: "wc", submissionId: "s1" }), []);
    });

    test("a built plan or child job naming another workspace is refused and nothing is stored", async () => {
      const ctx = make();
      const foreign = await plan(ctx, "wa", ["b1"]);
      await assert.rejects(ctx.repo.once({ workspaceId: "wb", submissionId: "s1", build: async () => foreign }),
        /Form delivery plan refused: the built plan is for workspace wa, submission s1, not workspace wb, submission s1/);
      const smuggled = { ...foreign, workspaceId: "wb", jobs: foreign.jobs.map(job => ({ ...job, id: "smuggled" })) };
      await assert.rejects(ctx.repo.once({ workspaceId: "wb", submissionId: "s1", build: async () => smuggled }),
        /Form delivery plan refused: child job smuggled is for workspace wa, submission s1, not workspace wb, submission s1/);
      assert.deepEqual(await ctx.repo.forSubmission({ workspaceId: "wb", submissionId: "s1" }), []);
      const rebuilt = await plan(ctx, "wb", []);
      assert.deepEqual(rebuilt.jobs, [], "the refused attempts left no plan behind, so a correct build is stored");
    });

    test("a status read returns only an allowlisted error code, never the raw outbox error text", async () => {
      const ctx = make();
      await plan(ctx, "wa", ["b1"]);
      const [claimed] = await ctx.outbox.claimPending({ batchSize: 10, nowIso: at(1) });
      const leaked = "token " + "abc" + " leaked";
      await ctx.outbox.markFailed({ id: claimed.id, error: leaked, nextAttemptAt: at(60_000), nextStatus: "pending" });
      const [row] = await ctx.repo.forSubmission({ workspaceId: "wa", submissionId: "s1" });
      assert.deepEqual(row, { bindingId: "b1", adapterId: "adapter-b1", formId: "form-wa", submissionId: "s1",
        status: "retrying", attempts: 1, nextRetryAt: at(60_000), errorCode: "delivery-failed" });
      const [recent] = await ctx.repo.recentUnfinished({ workspaceId: "wa" });
      assert.equal(recent.errorCode, "delivery-failed");
      assert.doesNotMatch(JSON.stringify([row, recent]), /abc|a@example\.com/);
    });

    test("a lease held in workspace A neither blocks workspace B nor can be released by B's token", async () => {
      const { leases } = make();
      const claim = { receiverKey: "host:https://r.example", nowIso: T0, recentMs: 0, leaseMs: 60_000 };
      assert.deepEqual(await leases.claim({ ...claim, workspaceId: "wa", token: "ta" }), { claimed: true });
      assert.deepEqual(await leases.claim({ ...claim, workspaceId: "wb", token: "tb" }), { claimed: true });
      await leases.release({ workspaceId: "wb", receiverKey: claim.receiverKey, token: "ta" });
      assert.deepEqual(await leases.claim({ ...claim, workspaceId: "wa", token: "tc", nowIso: at(1) }), { claimed: false, reason: "already-running" });
    });

    test("release is fenced by token: a stale holder cannot clear a newer holder's lease", async () => {
      const { leases } = make();
      const key = { workspaceId: "wa", receiverKey: "host:https://r.example" };
      assert.deepEqual(await leases.claim({ ...key, token: "stale", nowIso: T0, recentMs: 0, leaseMs: 1_000 }), { claimed: true });
      assert.deepEqual(await leases.claim({ ...key, token: "newer", nowIso: at(2_000), recentMs: 0, leaseMs: 60_000 }), { claimed: true },
        "an expired lease is free again (crash recovery)");
      await leases.release({ ...key, token: "stale" });
      assert.deepEqual(await leases.claim({ ...key, token: "third", nowIso: at(2_001), recentMs: 0, leaseMs: 60_000 }), { claimed: false, reason: "already-running" });
      await leases.release({ ...key, token: "newer" });
      assert.deepEqual(await leases.claim({ ...key, token: "third", nowIso: at(2_002), recentMs: 0, leaseMs: 60_000 }), { claimed: true });
    });

    test("a claim says why it refused: a live lease is already-running, a recent start is recent", async () => {
      const { leases } = make();
      const key = { workspaceId: "wa", receiverKey: "host:https://r.example" };
      await leases.claim({ ...key, token: "t1", nowIso: T0, recentMs: 60_000, leaseMs: 30_000 });
      assert.deepEqual(await leases.claim({ ...key, token: "t2", nowIso: at(1), recentMs: 0, leaseMs: 30_000 }), { claimed: false, reason: "already-running" });
      await leases.release({ ...key, token: "t1" });
      assert.deepEqual(await leases.claim({ ...key, token: "t2", nowIso: at(59_999), recentMs: 60_000, leaseMs: 30_000 }), { claimed: false, reason: "recent" });
      assert.deepEqual(await leases.claim({ ...key, token: "t2", nowIso: at(59_999), recentMs: 0, leaseMs: 30_000 }), { claimed: true }, "manual bypasses recent");
    });

    test("a lease that would already be over (leaseMs <= 0) is refused before anything is stored", async () => {
      const { leases } = make();
      const key = { workspaceId: "wa", receiverKey: "host:https://r.example" };
      await assert.rejects(leases.claim({ ...key, token: "t1", nowIso: T0, recentMs: 0, leaseMs: 0 }),
        { name: "RangeError", message: "Form pull lease refused: nowIso must be an ISO time and leaseMs a positive finite number (got 0); pass the pull's bounded duration." });
      assert.deepEqual(await leases.claim({ ...key, token: "t2", nowIso: T0, recentMs: 60_000, leaseMs: 1_000 }), { claimed: true }, "no start was recorded");
    });

    test("a manual claim is not refused as recent when the clock moved back past the last start", async () => {
      const { leases } = make();
      const key = { workspaceId: "wa", receiverKey: "host:https://r.example" };
      await leases.claim({ ...key, token: "t1", nowIso: at(10_000), recentMs: 0, leaseMs: 1_000 });
      await leases.release({ ...key, token: "t1" });
      assert.deepEqual(await leases.claim({ ...key, token: "t2", nowIso: T0, recentMs: 0, leaseMs: 1_000 }), { claimed: true });
    });
  }
);
