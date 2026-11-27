/**
 * @file `registerFormsSubmit`'s two host closures: the upload free-space probe (skipped for remote
 * media, `statfs` of the uploads dir otherwise) and upload attribution to the site's active System
 * principal. The route and the file-storage factory are replaced so the closures `visitor-submit.ts`
 * builds can be invoked directly; `node:fs/promises` keeps every real export except `statfs`.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { MountInput } from "../module-handles.js";

type RouteInput = { app: unknown; deps: { workspaceId: string; submitForm: { readUploadFreeBytes: () => Promise<number | undefined>; uploadSpaceMessage: string; files: unknown } } };
type StorageInput = { resolveCreatedByPrincipal: (input: { workspaceId: string }) => Promise<string> };

const routeCalls: RouteInput[] = [];
const storageCalls: StorageInput[] = [];
const statfsPaths: string[] = [];
const storage = { marker: "form-file-storage" };

const realFs = await import("node:fs/promises");
mock.module("node:fs/promises", { namedExports: { ...realFs, statfs: async (path: string) => { statfsPaths.push(path); return { bavail: 7, bsize: 4096 }; } } });
const realRoute = await import("../../../../inbound/public-http/routes/site/forms-submit.js");
mock.module("../../../../inbound/public-http/routes/site/forms-submit.js", { namedExports: { ...realRoute, registerFormsSubmitRoute: (input: RouteInput) => { routeCalls.push(input); } } });
const realStorage = await import("@jini-ai/cms/forms/site/form-file-storage");
mock.module("@jini-ai/cms/forms/site/form-file-storage", { namedExports: { ...realStorage, createFormFileStorage: (input: StorageInput) => { storageCalls.push(input); return storage; } } });
const { registerFormsSubmit } = await import("../visitor-submit.js");

type Principal = { id: string; kind: string; status: string; displayName: string };

function register({ isMediaRemote, principals = [], identityReady = Promise.resolve() }: {
  isMediaRemote?: () => Promise<boolean>; principals?: Principal[]; identityReady?: Promise<void>;
}) {
  routeCalls.length = 0; storageCalls.length = 0; statfsPaths.length = 0;
  const listed: Array<{ workspaceId: string }> = [];
  const routeDeps = {
    workspaceId: "ws-forms", identityReady,
    siteStoragePaths: { mediaUploadsDir: "/site/media/uploads" },
    siteBackupSources: isMediaRemote ? { isMediaRemote } : undefined,
    principalRepo: { list: async (input: { workspaceId: string }) => { listed.push(input); return principals; } },
    clock: { nowMs: () => 0, nowIso: () => "2026-01-01T00:00:00.000Z" }, idGen: { newId: () => "id-1" },
  } as unknown as MountInput["routeDeps"];
  const app = { marker: "express-app" } as unknown as MountInput["app"];
  registerFormsSubmit({ app, routeDeps });
  assert.equal(routeCalls.length, 1);
  assert.equal(storageCalls.length, 1);
  return { route: routeCalls[0]!, storageInput: storageCalls[0]!, listed, app };
}

test("the forms route is registered once on the app with the site workspace and the composed file storage", () => {
  const { route, app } = register({});
  assert.equal(route.app, app);
  assert.equal(route.deps.workspaceId, "ws-forms");
  assert.equal(route.deps.submitForm.files, storage);
  assert.equal(route.deps.submitForm.uploadSpaceMessage, "This site has no room for another attachment. Your answers are kept below. Your form has not been sent.");
});

test("upload free space: remote media reports no local limit and never probes the disk", async () => {
  const { route } = register({ isMediaRemote: async () => true });
  assert.equal(await route.deps.submitForm.readUploadFreeBytes(), undefined);
  assert.deepEqual(statfsPaths, []);
});

test("upload free space: local media reports available blocks times block size of the uploads dir", async () => {
  for (const isMediaRemote of [async () => false, undefined]) {
    const { route } = register({ isMediaRemote });
    assert.equal(await route.deps.submitForm.readUploadFreeBytes(), 7 * 4096);
    assert.deepEqual(statfsPaths, ["/site/media/uploads"]);
  }
});

test("upload attribution waits for the identity seed, then picks only the active principal named System of kind system", async () => {
  let seeded!: () => void;
  const identityReady = new Promise<void>((resolve) => { seeded = resolve; });
  const { storageInput, listed } = register({ identityReady, principals: [
    { id: "p-user", kind: "user", status: "active", displayName: "System" },
    { id: "p-disabled", kind: "system", status: "disabled", displayName: "System" },
    { id: "p-other", kind: "system", status: "active", displayName: "Importer" },
    { id: "p-system", kind: "system", status: "active", displayName: "System" },
  ] });
  const resolving = storageInput.resolveCreatedByPrincipal({ workspaceId: "ws-forms" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(listed, [], "principals are not read before identity has seeded the System principal");
  seeded();
  assert.equal(await resolving, "p-system");
  assert.deepEqual(listed, [{ workspaceId: "ws-forms" }]);
});

test("upload attribution refuses when the site has no active System principal", async () => {
  const { storageInput } = register({ principals: [{ id: "p-disabled", kind: "system", status: "disabled", displayName: "System" }] });
  await assert.rejects(storageInput.resolveCreatedByPrincipal({ workspaceId: "ws-forms" }), { message: "form uploads require the site's System principal" });
});
