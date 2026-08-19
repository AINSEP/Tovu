import assert from "node:assert/strict";
import test from "node:test";

import { createRestorePoint } from "../../restore-points.js";

/**
 * @file SPEC-017 C-108 / REQ-22 / AC-26 / AC-27 — `backup_create_restore_point`.
 *
 * Assumed seam design:
 *
 * ```ts
 * export class ValidationError extends Error {}
 * export class RestorePointUnavailableError extends Error {}
 *
 * export interface RestorePointSummary { id: string; costClass: "cheap"|"expensive"|"unavailable"; kind: string; }
 *
 * export async function createRestorePoint(
 *   required: {
 *     costClass: "cheap" | "expensive" | "unavailable";
 *     costAck?: boolean;
 *     capture: () => Promise<{ artifactRef: string; watermarkAtCapture: number }>;
 *   },
 *   optional?: {}
 * ): Promise<RestorePointSummary>;
 * ```
 */

test("AC-26 / REQ-22: createRestorePoint on an 'expensive' site without costAck is rejected with ValidationError", async () => {
  await assert.rejects(
    createRestorePoint({
      costClass: "expensive",
      capture: async () => ({ artifactRef: "/tmp/x", watermarkAtCapture: 1 }),
    }),
    (err: unknown) => (err as Error).name === "ValidationError"
  );
});

test("AC-27 / REQ-22: createRestorePoint on an 'expensive' site WITH costAck=true mints the restore point", async () => {
  const result = await createRestorePoint({
    costClass: "expensive",
    costAck: true,
    capture: async () => ({ artifactRef: "/tmp/x", watermarkAtCapture: 5 }),
  });

  assert.ok(result.id);
  assert.equal(result.costClass, "expensive");
});

test("createRestorePoint on a 'cheap' site succeeds without costAck (only 'expensive' requires it)", async () => {
  const result = await createRestorePoint({
    costClass: "cheap",
    capture: async () => ({ artifactRef: "/tmp/x", watermarkAtCapture: 3 }),
  });
  assert.ok(result.id);
});

test("EC-04 / REQ-22: createRestorePoint on an 'unavailable' site is rejected with RestorePointUnavailableError, regardless of costAck", async () => {
  await assert.rejects(
    createRestorePoint({
      costClass: "unavailable",
      costAck: true,
      capture: async () => ({ artifactRef: "/tmp/x", watermarkAtCapture: 1 }),
    }),
    (err: unknown) => (err as Error).name === "RestorePointUnavailableError"
  );
});
