import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type { DeployPublishInput, DeployPublishOptions, DeployTarget } from "@jini-ai/devops/deploy";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryCustomCredentialSetRepo, listCustomCredentials, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import type { DeployTargetRegistry, LoadedDeployTarget } from "#src/features/deployments/deploy-targets/types";
import { publishStaticSite } from "#src/features/deployments/static-publish/adapter";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { formDestinationKey, listFormDestinations, loadFormDestinationRegistryFromSource } from "../index.js";
import { createFormDestinationPort } from "../port.js";
import type { FormDestinationForm } from "../types.js";

/**
 * @file Compatibility regression for the first site that published forms before destinations were
 * their own category (BYHO, hosted on Cloudflare Workers). With `core.forms` `receiver` unset, its
 * next republish must be wire-identical to the earlier one: the same `metadata.formDestination`
 * handed to the hosting target, the same vault label and key, and the same receipt key, so its
 * receiver, D1 database, Worker and dedupe receipts are untouched. Runs the REAL publish adapter
 * (real export of the hermetic fixture) against the REAL bundled destination file; no network.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-form-destination-compat-"));
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "../../../../../../content/agent-plugins/cloudflare");
const HOST = "cloudflare-workers";
const ORIGIN = "https://byho.io";
const KEY = "b".repeat(43);
/** BYHO's three forms, in the manifest shape the earlier publish sent. */
const BYHO_FORMS: FormDestinationForm[] = [
  { slug: "waitlist", fields: [{ name: "email", required: true, maxLength: 254 }] },
  { slug: "artist", fields: [{ name: "name", required: true, maxLength: 200 }, { name: "email", required: true, maxLength: 254 }, { name: "links", required: false, maxLength: 2000 }] },
  { slug: "host", fields: [{ name: "venue", required: true, maxLength: 200 }, { name: "email", required: true, maxLength: 254 }] },
];

function credentials(): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let n = 0;
  return { repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring,
    clock: createFakeClock({ startIso: "2026-10-19T00:00:00.000Z" }), idGen: { newId: () => `cred-${++n}` } };
}

async function republish(required: { creds: CustomCredentialWriteDeps; newSecret: () => string }) {
  const registry = await loadFormDestinationRegistryFromSource({ pluginId: "cloudflare", packageRoot: PLUGIN_ROOT });
  const formDestination = createFormDestinationPort({ listForms: async () => BYHO_FORMS, credentials: required.creds,
    loadRegistry: async () => registry, readSetting: async () => undefined }, { newSecret: required.newSecret });
  const published: { input?: DeployPublishInput; options?: DeployPublishOptions } = {};
  const target: DeployTarget = {
    id: HOST,
    async publish(input, options) { published.input = input; published.options = options; return { targetId: HOST, url: `${ORIGIN}/`, status: "ready" as const }; },
    async checkReachability() { return { reachable: true }; },
  };
  const loaded: LoadedDeployTarget = { descriptor: { id: HOST, label: "Workers", module: `targets/${HOST}.mjs`, configFields: [] }, pluginId: "cloudflare", module: { create: () => assert.fail("buildTarget wins") } };
  const deployTargets: DeployTargetRegistry = { get: (id) => (id === HOST ? loaded : undefined), list: () => [loaded], refusals: [] };
  const routeDeps = createRouteDeps();
  const outcome = await publishStaticSite(
    { credentialSource: { resolve: async () => ({ ok: true, token: "tok" }), isConfigured: async () => ({ configured: true }) },
      loadDeployTargets: async () => deployTargets, buildTarget: () => target, formDestination },
    { workspaceId: routeDeps.workspaceId, publishOutputRootDir: publishOutputDir, idGen: routeDeps.idGen, exportSiteBound: routeDeps.exportSiteBound, config: { target: HOST }, projectName: "byho-mingjie" },
  );
  return { outcome, published, workspaceId: routeDeps.workspaceId };
}

test("BYHO with the receiver setting unset republishes wire-identical to the earlier forms publish", async () => {
  const creds = credentials();
  const first = await republish({ creds, newSecret: () => KEY });
  assert.equal(first.outcome.ok, true);
  // The earlier publish's metadata: the config, then `formDestination = { forms, secret }`.
  assert.deepEqual(first.published.options?.metadata, { target: HOST, formDestination: { forms: BYHO_FORMS, secret: KEY } });
  assert.equal(first.published.input?.files.some((file) => /action="https:/.test(String(file.data))), false, "a co-hosted receiver leaves exported form actions alone");

  const saved = await listCustomCredentials(creds, { workspaceId: first.workspaceId });
  assert.deepEqual(saved.map((summary) => [summary.label, summary.category]), [["Form submissions key: cloudflare-workers", "hosting"]]);

  const again = await republish({ creds, newSecret: () => assert.fail("a republish reuses the saved key") });
  assert.deepEqual(again.published.options?.metadata, { target: HOST, formDestination: { forms: BYHO_FORMS, secret: KEY } });
  assert.equal((await listCustomCredentials(creds, { workspaceId: first.workspaceId })).length, 1, "no second key");
});

test("BYHO's saved key still pulls through the same receiver client, with the same receipt key", async () => {
  const creds = credentials();
  const { workspaceId } = await republish({ creds, newSecret: () => KEY });
  const pending = await listFormDestinations({ credentials: creds, workspaceId });
  assert.deepEqual(pending, [{ scope: HOST, destination: { url: ORIGIN, secret: KEY } }]);
  assert.equal(formDestinationKey({ scope: HOST, url: pending[0]!.destination.url }), "cloudflare-workers:https://byho.io");

  const registry = await loadFormDestinationRegistryFromSource({ pluginId: "cloudflare", packageRoot: PLUGIN_ROOT });
  const lib = await import(pathToFileURL(path.join(PLUGIN_ROOT, "lib/forms.mjs")).href) as { pullFormSubmissions: unknown; acknowledgeFormSubmissions: unknown };
  const module = registry.resolve({ scope: HOST })?.module;
  assert.equal(module?.pull, lib.pullFormSubmissions);
  assert.equal(module?.ack, lib.acknowledgeFormSubmissions);
});
