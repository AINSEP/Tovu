#!/usr/bin/env python3
"""S6a T0 mutation loop. For each row: apply one textual mutation to SRC, run TEST, expect it to fail and its output to name NAME;
restore SRC with `git show HEAD:`. Usage: mutate.py (run from the Tovu root, PATH with node 24)."""
import os, subprocess, sys
W = "apps/website/src/"
OB, CS = W + "platform/db/repos/outbox-repo.ts", W + "platform/db/repos/change-set-repo.ts"
OBC = W + "platform/db/repos/__tests__/outbox-repo.characterization.test.ts"
CSC = W + "platform/db/repos/__tests__/change-set-repo.characterization.test.ts"
CON = W + "contracts/core/events/__tests__/outbox-repo.contract.test.ts"
CST = W + "platform/db/repos/__tests__/change-set-repo.test.ts"
P1 = W + "__tests__/lane-su-pins/p1-lock-keys.test.ts"
P8 = W + "__tests__/lane-su-pins/p7-p8-outbox-formats.test.ts"
IMP = 'import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";\n'
ROWS = [
 (OB, [('await this.kernel.lockKey("outbox_events:claim");', '')], P1, "outbox claim"),
 (OB, [('.where("status", "in", CLAIMABLE_STATUSES)', '.where("status", "in", ["pending"])')], CON, "a row left in processing is claimed again once its claim lease has expired"),
 (OB, [('this.claimLeaseMs = optional.claimLeaseMs ?? DEFAULT_OUTBOX_CLAIM_LEASE_MS;', 'this.claimLeaseMs = optional.claimLeaseMs ?? 1;')], OBC, "without an option the stored lease expiry is now + the events barrel constant exactly"),
 (OB, [('this.claimLeaseMs = optional.claimLeaseMs ?? DEFAULT_OUTBOX_CLAIM_LEASE_MS;', 'this.claimLeaseMs = DEFAULT_OUTBOX_CLAIM_LEASE_MS;')], OBC, "an option overrides the constant"),
 (OB, [('.set({ status: nextStatus, last_error: error, next_attempt_at: nextAttemptAt })', '.set({ status: nextStatus, last_error: null, next_attempt_at: nextAttemptAt })')], OBC, "markFailed with nextStatus pending keeps attempts"),
 (OB, [('.set({ status: "delivered" })', '.set({ status: "delivered", next_attempt_at: "2000-01-01T00:00:00.000Z" })')], OBC, "markFailed with nextStatus pending keeps attempts"),
 (OB, [('.set({ status: "processing", attempts: row.attempts + 1, next_attempt_at: leaseExpiresAt })', '.set({ status: "processing", attempts: row.attempts, next_attempt_at: leaseExpiresAt })')], OBC, "two concurrent claimers never take one event"),
 (OB, [('await this.kernel.run((db) =>\n      db.insertInto("outbox_events").values(outboxEventValues(event))', 'await freshSqliteContentKernel().run((db) =>\n      db.insertInto("outbox_events").values(outboxEventValues(event))'), ('import type { Selectable }', IMP + 'import type { Selectable }')], OBC, "enqueue takes part in the caller's transaction"),
 (OB, [('.onConflict((oc) => oc.column("id").doNothing())', '')], CON, "enqueue() of an id already in the outbox is a no-op"),
 (OB, [('id: event.id,\n    workspace_id: event.workspaceId,', 'id: event.id,\n    workspace_id: event.id,')], P8, "P8 a frozen event maps to the frozen outbox row"),
 (CS, [('this.kernel.transaction(async () =>\n      this.kernel.run(', '((fn: () => Promise<void>) => fn())(async () =>\n      this.kernel.run(')], CST, "a failing item write rolls back the header and the event with it"),
 (CS, [('.where("workspace_id", "=", required.workspaceId)\n        .where("id", "=", required.id)', '.where("id", "=", required.id)')], CSC, "findById, findByIdempotencyKey and listByWorkspace answer only"),
 (CS, [('.where("workspace_id", "=", required.workspaceId)\n        .where("idempotency_key", "=", required.idempotencyKey)', '.where("idempotency_key", "=", required.idempotencyKey)')], CSC, "findById, findByIdempotencyKey and listByWorkspace answer only"),
 (CS, [('.where("workspace_id", "=", required.workspaceId).orderBy("created_at")', '.orderBy("created_at")')], CSC, "findById, findByIdempotencyKey and listByWorkspace answer only"),
 (CS, [('.where("workspace_id", "=", record.workspaceId)\n        .where("id", "=", record.id)', '.where("id", "=", record.id)')], CSC, "save writes status and the two timestamps of its own workspace"),
 (CS, [('values(outboxEventValues(event))', 'values({ ...outboxEventValues(event), status: "processing" })')], CSC, "the co-persisted outbox row is the frozen outbox row"),
 (CS, [('if (event) await', 'if (false as boolean) await')], CST, "a supplied event is co-persisted as a pending outbox row"),
]
TT = ["node", "--import", "tsx", "--import", "./development/test-support/composed-bundle-env.ts", "--test", "--experimental-test-module-mocks"]
env = dict(os.environ, TSX_TSCONFIG_PATH="apps/site-chat/tsconfig.json")
bad = 0
for i, (src, muts, test, name) in enumerate(ROWS, 1):
    orig = open(src).read(); text = orig
    for old, new in muts:
        assert text.count(old) == 1, f"row {i}: pattern not found exactly once: {old[:50]!r}"
        text = text.replace(old, new)
    open(src, "w").write(text)
    try:
        r = subprocess.run(TT + [test], env=env, capture_output=True, text=True)
        out = r.stdout + r.stderr
        status = "NOT CHARACTERIZED" if r.returncode == 0 else ("RED" if name in out else "RED FOR ANOTHER REASON")
    finally:
        h = subprocess.run(["git", "show", "HEAD:" + src], capture_output=True, text=True, check=True).stdout
        open(src, "w").write(h)
    if status != "RED": bad += 1
    print(f"row {i:2d} {status:24s} {os.path.basename(src)} :: {name}", flush=True)
print("BAD" if bad else "ALL RED", bad)
sys.exit(1 if bad else 0)
