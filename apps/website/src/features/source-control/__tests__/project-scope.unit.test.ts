import assert from "node:assert/strict";
import test from "node:test";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { CredentialProjectHalf } from "../../vendor-credentials/project-scope.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";
import type { SourceControlCredentialSetRepoPort } from "../types.js";
import { exampleProviders } from "./fixtures/example-provider.js";
import {
  createSourceControlCredential,
  deleteSourceControlCredential,
  describeCredential,
  findDefaultSourceControlCredential,
  listSourceControlCredentials,
  resolveDefaultForSourceControl,
  SourceControlCredentialDuplicateLabelError,
  SourceControlCredentialValidationError,
  updateSourceControlCredential,
  type SourceControlCredentialWriteDeps,
} from "../store.js";

/**
 * @file Source-control (git host) tokens are project-first (owner 2026-10-25), the same rule as custom
 * and publish keys (`vendor-credentials/project-scope.ts`): a save lands in the project store every
 * site of the project shares; a site's own row (existing, or saved "only for this site") wins; no
 * project store (Fly) keeps today's site-only behaviour. Real AES-GCM, a separate key per store.
 */

const SITE_A = "ws-site-a";
const SITE_B = "ws-site-b";
// Fake secrets built at runtime, never literals that look like a key.
const secret = (name: string) => `${name}-${"x".repeat(8)}-${name.length}1234`;
const noNetwork = (async () => { throw new Error("no network in this test"); }) as unknown as typeof fetch;

function projectHalf(): CredentialProjectHalf<SourceControlCredentialSetRepoPort> {
  const keyring = new InMemoryKeyring();
  return { workspaceId: "project", repo: new InMemorySourceControlCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring };
}

let ids = 0;
function site(project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort>): SourceControlCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  return { repo: new InMemorySourceControlCredentialSetRepo({}, project ? { project } : {}), sealer: new AesGcmSecretSealer(keyring), keyring,
    clock: createFakeClock({ startIso: "2026-10-25T00:00:00.000Z" }), idGen: { newId: () => `sc-${++ids}` },
    fetchFn: noNetwork, loadSourceControlProviders: exampleProviders };
}

const save = (deps: SourceControlCredentialWriteDeps, workspaceId: string, label: string, token: string, optional: { scope?: string } = {}) =>
  createSourceControlCredential({ deps, input: { workspaceId, label, connection: { providerId: "example-git", token }, ...optional } });

test("a git host token saves to the project store and a second site of the project backs up with it", async () => {
  const project = projectHalf();
  const a = site(project);
  const token = secret("git");
  const saved = await save(a, SITE_A, "default", token);
  assert.equal(saved.scope, "project");
  assert.equal(await a.repo.findById({ workspaceId: SITE_A, id: saved.id }), null, "nothing in the site vault");
  assert.equal(JSON.stringify(saved).includes(token), false);

  const b = site(project);
  assert.deepEqual(await resolveDefaultForSourceControl(b, { workspaceId: SITE_B, providerId: "example-git" }),
    { id: saved.id, label: "default", connection: { providerId: "example-git", token } });
  assert.equal((await findDefaultSourceControlCredential(b, { workspaceId: SITE_B, providerId: "example-git" }))?.id, saved.id);
  assert.deepEqual((await listSourceControlCredentials(b, { workspaceId: SITE_B })).map(row => [row.id, row.scope]), [[saved.id, "project"]]);
  assert.equal((await describeCredential(b, { workspaceId: SITE_B, id: saved.id }))?.scope, "project");
});

test("a site's own token wins over the project's; same host and label shadows the project row in the list", async () => {
  const project = projectHalf();
  await save(site(project), SITE_A, "default", secret("shared"));
  const b = site(project);
  const own = await save(b, SITE_B, "default", secret("own"), { scope: "site" });
  assert.equal(own.scope, "site");
  assert.equal((await resolveDefaultForSourceControl(b, { workspaceId: SITE_B, providerId: "example-git" }))?.connection.token, secret("own"));
  assert.deepEqual((await listSourceControlCredentials(b, { workspaceId: SITE_B })).map(row => [row.id, row.scope]), [[own.id, "site"]]);
});

test("a project save whose host and label the site already uses is refused; a bad scope is refused", async () => {
  const project = projectHalf();
  const a = site(project);
  await save(a, SITE_A, "default", secret("own"), { scope: "site" });
  await assert.rejects(() => save(a, SITE_A, "default", secret("again")), SourceControlCredentialDuplicateLabelError);
  await assert.rejects(() => save(a, SITE_A, "other", secret("x"), { scope: "everywhere" }), SourceControlCredentialValidationError);
  assert.equal((await project.repo.listByWorkspace({ workspaceId: "project" })).length, 0);
});

test("update and delete change a project row where it lives", async () => {
  const project = projectHalf();
  const a = site(project);
  const saved = await save(a, SITE_A, "default", secret("first"));
  const updated = await updateSourceControlCredential({ deps: a, input: { workspaceId: SITE_A, id: saved.id, label: "renamed",
    connection: { providerId: "example-git", token: secret("second") } } });
  assert.deepEqual([updated.label, updated.scope], ["renamed", "project"]);
  assert.equal((await resolveDefaultForSourceControl(site(project), { workspaceId: SITE_B, providerId: "example-git" }))?.connection.token, secret("second"));
  const renamedOnly = await updateSourceControlCredential({ deps: a, input: { workspaceId: SITE_A, id: saved.id, label: "again" } });
  assert.deepEqual([renamedOnly.label, renamedOnly.scope], ["again", "project"]);

  await deleteSourceControlCredential(a, { workspaceId: SITE_A, id: saved.id });
  assert.equal(await project.repo.findById({ workspaceId: "project", id: saved.id }), null);
});

test("no project store (Fly): tokens stay in the site vault and summaries carry no scope", async () => {
  const a = site();
  const saved = await save(a, SITE_A, "default", secret("fly"));
  assert.equal("scope" in saved, false);
  assert.ok(await a.repo.findById({ workspaceId: SITE_A, id: saved.id }));
  assert.equal((await resolveDefaultForSourceControl(a, { workspaceId: SITE_A, providerId: "example-git" }))?.connection.token, secret("fly"));
  assert.equal("scope" in (await listSourceControlCredentials(a, { workspaceId: SITE_A }))[0]!, false);
});
