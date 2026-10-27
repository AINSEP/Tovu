import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { DomainEvent } from "@jini-ai/cms/core";
import { FORM_DELIVERY_EVENT, type FormDeliveryJob, type FormDeliveryResult } from "@jini-ai/cms/forms";
import { set, type AuthorizeFn, type SettingsWriteServiceDeps } from "@jini-ai/core/settings";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { removeFrozenPackageTree } from "#src/features/agent-plugins/lifecycle";
import { createCustomCredential } from "#src/features/custom-credentials/index";
import { FORM_DESTINATIONS_FILENAME, formDestinationKeyLabel, type FormDestinationModule, type FormDestinationPage, type RemoteFormSubmission } from "#src/features/form-destinations/index";
import type { FormsAutoPullPort } from "#src/features/forms/index";
import { createSettingsPrincipalLookup, writeFormDeliveryBindings } from "#src/features/settings/index";
import { SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { SiteStore } from "../open-site-store.js";
import { createSiteRouteDeps } from "../deps.js";

/**
 * @file Harness for `form-delivery-vertical-slice.integration.test.ts`: a real site composition
 * (`createSiteRouteDeps` on a fresh SQLite site folder) with ONE test Agent Plugin installed through
 * the real seed/digest/activation path. The plugin contributes a co-hosted receiver and two push
 * destinations, all backed by the same `.mjs` module, which forwards every call to the typed fakes
 * below through a global hook (a plugin module runs in-process but is loaded from disk, so a hook is
 * the only way to hand it test doubles). Nothing in the product is stubbed: the registry, trust
 * gate, vault, settings, planner, outbox and pull lease are the composition's own.
 */

/** The global the fixture module reads; one per test process. */
const FIXTURE_HOOK = Symbol.for("tovu.test.form-delivery-vertical-slice");
const PLUGIN_ID = "form-delivery-fixture";
export const RECEIVER_SCOPE = "fixture-host";
export const RECEIVER_URL = "https://receiver.example.test";
export const PUSH_A = "fixture-push-a";
export const PUSH_B = "fixture-push-b";
export const FORM_ID = "form-contact";
export const FORM_SLUG = "contact";
const OWNER = "owner";

/** One push adapter call, as the adapter saw it (the kit is left out: it holds functions). */
export interface DeliveryCall {
  readonly adapterId: string;
  readonly input: Omit<Parameters<NonNullable<FormDestinationModule["deliver"]>>[0], "kit">;
}

/** The two push destinations: every call is recorded, and each (adapter, submission) answers from a
 * scripted queue, then `{ ok: true }` once the queue is empty. */
export class FakePushDestinations {
  readonly calls: DeliveryCall[] = [];
  private readonly scripts = new Map<string, FormDeliveryResult[]>();

  script(required: { adapterId: string; submissionId: string; results: FormDeliveryResult[] }): void {
    this.scripts.set(`${required.adapterId}\n${required.submissionId}`, [...required.results]);
  }

  callsFor(required: { adapterId: string; submissionId: string }): DeliveryCall[] {
    return this.calls.filter((call) => call.adapterId === required.adapterId && call.input.submission.id === required.submissionId);
  }

  readonly deliver: NonNullable<FormDestinationModule["deliver"]> = async ({ kit: _kit, ...input }) => {
    const adapterId = input.binding?.adapterId ?? "(no binding)";
    this.calls.push({ adapterId, input });
    return this.scripts.get(`${adapterId}\n${input.submission.id}`)?.shift() ?? { ok: true };
  };
}

/** The receiver a published static site stored submissions at: rows wait until acknowledged. A test
 * can hold the next pull open to observe what happens while it is in flight. */
export class FakeReceiver {
  readonly pending = new Map<string, RemoteFormSubmission>();
  readonly acked: string[] = [];
  pulls = 0;
  private held: { entered: () => void; released: Promise<void> } | undefined;
  private seq = 0;

  add(required: { id: string; answers: Record<string, string>; submittedAt: string }): void {
    this.seq += 1;
    this.pending.set(required.id, { seq: this.seq, id: required.id, formSlug: FORM_SLUG, answers: required.answers, submittedAt: required.submittedAt, ip: "198.51.100.7" });
  }

  /** The next pull blocks until `release`; `entered` resolves once it has started. */
  hold(): { entered: Promise<void>; release: () => void } {
    let release = (): void => undefined;
    let entered = (): void => undefined;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    this.held = { entered, released: new Promise<void>((resolve) => { release = resolve; }) };
    return { entered: enteredPromise, release };
  }

  readonly pull: NonNullable<FormDestinationModule["pull"]> = async (_required, optional = {}) => {
    this.pulls += 1;
    const held = this.held;
    this.held = undefined;
    if (held) { held.entered(); await held.released; }
    const after = optional.after ?? 0;
    const items = [...this.pending.values()].filter((row) => row.seq > after).slice(0, optional.limit ?? 50);
    const page: FormDestinationPage = { items, nextAfter: items.at(-1)?.seq ?? after, hasMore: false };
    return page;
  };

  readonly ack: NonNullable<FormDestinationModule["ack"]> = async ({ ids }) => {
    for (const id of ids) { this.pending.delete(id); this.acked.push(id); }
    return { acknowledged: ids.length };
  };
}

/** What the fixture module calls. */
type FixtureHook = Required<Pick<FormDestinationModule, "pull" | "ack" | "deliver">>;

/** Installs the hook the fixture module forwards to; returns its removal. */
export function installFixtureHook(required: { receiver: FakeReceiver; destinations: FakePushDestinations }): () => void {
  const hook: FixtureHook = { pull: required.receiver.pull, ack: required.receiver.ack, deliver: required.destinations.deliver };
  Reflect.set(globalThis, FIXTURE_HOOK, hook);
  return () => { Reflect.deleteProperty(globalThis, FIXTURE_HOOK); };
}

const FIXTURE_MODULE = `const hook = () => {
  const found = globalThis[Symbol.for("tovu.test.form-delivery-vertical-slice")];
  if (!found) throw new Error("the form delivery fixture hook is not installed");
  return found;
};
export default {
  pull(required, optional) { return hook().pull(required, optional); },
  ack(required) { return hook().ack(required); },
  deliver(required) { return hook().deliver(required); },
};
`;

export type SiteDeps = Awaited<ReturnType<typeof createSiteRouteDeps>>;

/** Gives every composition in this file a throwaway HOME and site key, and binds the plugin and
 * skill layouts to the booted site; returns the restore. */
export function isolateSiteEnvironment(required: { home: string }): () => void {
  const names = ["HOME", "TOVU_SITE_KEY", SITE_KEY_ENV_VAR_NAME, "TOVU_RUNTIME_MODE", "TOVU_AGENT_PLUGINS_DIR", "TOVU_SKILLS_DIR"];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  process.env.HOME = required.home;
  process.env.TOVU_SITE_KEY = randomBytes(32).toString("hex");
  return () => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/** A booted composition and how to shut it down (store close also drains the app's boot work). */
export interface FixtureSite {
  readonly deps: SiteDeps;
  readonly kernel: ContentKernel;
  close(): Promise<void>;
}

/** Composes the site at `dir` (fresh or reopened) and waits for every boot step to settle. */
export async function bootSite(required: { dir: string }): Promise<FixtureSite> {
  let store: SiteStore | undefined;
  const deps = await createSiteRouteDeps(path.join(required.dir, "content.db"), {
    siteBinding: { dir: required.dir, name: path.basename(required.dir), dirOverridden: true, switcherCompatible: false },
    onStoreOpened: (opened) => { store = opened; },
  });
  await Promise.allSettled(Object.entries(deps).filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise).map(([, value]) => value));
  assert.ok(deps.contentKernel, "the SQLite composition exposes its content kernel");
  assert.ok(store, "the composition reported its store");
  const opened = store;
  return { deps, kernel: deps.contentKernel, close: () => opened.close() };
}

/** Removes a site folder, including the frozen (read-only) installed plugin package. */
export async function removeSiteDir(required: { dir: string }): Promise<void> {
  await removeFrozenPackageTree({ root: required.dir });
  fs.rmSync(required.dir, { recursive: true, force: true });
}

/** Installs the fixture plugin through the bundled-seed path (digest recorded, plugin active). */
export async function installFixturePlugin(required: { deps: SiteDeps }): Promise<void> {
  const { deps } = required;
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-delivery-plugin-"));
  try {
    const pluginRoot = path.join(sourceRoot, PLUGIN_ID);
    fs.mkdirSync(pluginRoot);
    const files: Record<string, string> = {
      "plugin.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN_ID, version: "1.0.0" }),
      [FORM_DESTINATIONS_FILENAME]: JSON.stringify({ schemaVersion: 1, destinations: [
        { id: "fixture-receiver", label: "Fixture receiver", module: "fixture.mjs", receive: "co-hosted", hosts: [RECEIVER_SCOPE] },
        { id: PUSH_A, label: "Fixture rows A", module: "fixture.mjs" },
        { id: PUSH_B, label: "Fixture rows B", module: "fixture.mjs" },
      ] }),
      "fixture.mjs": FIXTURE_MODULE,
    };
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(pluginRoot, name), content);
    await deps.agentPluginLifecycle.seedBundledAgentPlugins({ layout: deps.agentPluginLayout, workspaceId: deps.workspaceId, sourceRoot });
    await deps.agentPluginLifecycle.setAgentPluginActivation({ workspaceRoot: deps.agentPluginLayout.forWorkspace(deps.workspaceId).root, pluginId: PLUGIN_ID, enabled: true, actor: "test" });
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

/** Secret-shaped values are built at runtime, never committed. */
export function fixtureToken(required: { name: string }): string {
  return `${required.name}-${"t".repeat(32)}`;
}

/** The contact form, the receiver's saved key, and one saved credential per push destination (each
 * scoped by `worksFor` to its own adapter, as the connection port requires). */
export async function seedSite(required: { deps: SiteDeps }): Promise<{ connectionA: string; connectionB: string }> {
  const { deps } = required;
  const at = "2026-10-20T08:00:00.000Z";
  await deps.formDefinitionRepo.create({ id: FORM_ID, workspaceId: deps.workspaceId, name: "Contact", slug: FORM_SLUG, status: "active", version: 1, createdAt: at, updatedAt: at,
    notify: { enabled: false, recipients: [] },
    fields: [{ id: "email", label: "Email", type: "email", required: true }, { id: "message", label: "Message", type: "textarea", required: false }] });
  const credentials = { repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen };
  // Site-owned, as formReceiverKey saves it: a project key attaches to no site until the owner says yes.
  await createCustomCredential(credentials, { workspaceId: deps.workspaceId, scope: "site", label: formDestinationKeyLabel({ scope: RECEIVER_SCOPE }), category: "hosting",
    baseUrl: RECEIVER_URL, connection: { token: fixtureToken({ name: "receiver" }) } });
  const a = await createCustomCredential(credentials, { workspaceId: deps.workspaceId, scope: "site", label: "Rows A", category: "general", baseUrl: "https://rows-a.example.test", worksFor: [PUSH_A], connection: { token: fixtureToken({ name: "rows-a" }) } });
  const b = await createCustomCredential(credentials, { workspaceId: deps.workspaceId, scope: "site", label: "Rows B", category: "general", baseUrl: "https://rows-b.example.test", worksFor: [PUSH_B], connection: { token: fixtureToken({ name: "rows-b" }) } });
  return { connectionA: a.id, connectionB: b.id };
}

/** The settings write deps an owner's save goes through (validation, ledger, authorization port). */
function settingsWriteDeps(required: { deps: SiteDeps }): SettingsWriteServiceDeps {
  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test owner" });
  return { repo: required.deps.settingsRepo, clock: required.deps.clock, ids: required.deps.idGen, authorize,
    principals: createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) }) };
}

/** Saves `core.forms/deliveryBindings` through the validating writer. */
export async function writeBindings(required: { deps: SiteDeps; bindings: readonly Record<string, unknown>[] }): Promise<void> {
  const { deps } = required;
  await writeFormDeliveryBindings({ deps: settingsWriteDeps({ deps }), workspaceId: deps.workspaceId, callerPrincipalId: OWNER, value: required.bindings });
}

/** Saves `core.forms/autoPull`. */
export async function writeAutoPull(required: { deps: SiteDeps; value: boolean }): Promise<void> {
  const { deps } = required;
  await set({ deps: settingsWriteDeps({ deps }), input: { namespace: "core.forms", key: "autoPull", scope: "workspace", workspaceId: deps.workspaceId, callerPrincipalId: OWNER, value: required.value } });
}

/** Polls `check` until it returns a value or `timeoutMs` passes. */
export async function waitFor<T>(required: { what: string; check: () => Promise<T | undefined> }, optional: { timeoutMs?: number } = {}): Promise<T> {
  const deadline = Date.now() + (optional.timeoutMs ?? 15_000);
  for (;;) {
    const value = await required.check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${required.what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** One outbox row, parsed. */
export interface OutboxRow { readonly id: string; readonly status: string; readonly attempts: number; readonly nextAttemptAt: string; readonly event: DomainEvent; readonly eventJson: string }

export async function outboxRows(required: { kernel: ContentKernel }): Promise<OutboxRow[]> {
  const rows = await required.kernel.run((db) => db.selectFrom("outbox_events").select(["id", "status", "attempts", "next_attempt_at", "event_json"]).orderBy("id").execute());
  return rows.map((row) => ({ id: row.id, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, event: JSON.parse(row.event_json) as DomainEvent, eventJson: row.event_json }));
}

/** The delivery child jobs of one submission, by binding id. */
export async function deliveryJobs(required: { kernel: ContentKernel; submissionId: string }): Promise<(OutboxRow & { readonly job: FormDeliveryJob })[]> {
  const rows = await outboxRows(required);
  return rows.filter((row) => row.event.name === FORM_DELIVERY_EVENT && row.event.aggregateId === required.submissionId)
    .map((row) => ({ ...row, job: (JSON.parse(row.eventJson) as DomainEvent<FormDeliveryJob>).payload }))
    .sort((left, right) => left.job.binding.bindingId.localeCompare(right.job.binding.bindingId));
}

/** Every stored plan's submission id. */
export async function plannedSubmissions(required: { kernel: ContentKernel }): Promise<string[]> {
  const rows = await required.kernel.run((db) => db.selectFrom("form_delivery_plans").select("submission_id").orderBy("submission_id").execute());
  return rows.map((row) => row.submission_id);
}

/** Waits until every `form.submission.received` row is delivered: a pull that imported rows drains
 * them in the background, and that drain must finish before a test drains on its fake clock (far
 * ahead of the wall clock, so it would reclaim a row still in flight) or closes the store. */
export async function awaitReceivedSettled(required: { kernel: ContentKernel }): Promise<void> {
  await waitFor({ what: "the pull's background drain of form.submission.received", check: async () => {
    const unsettled = (await outboxRows(required)).filter((row) => row.event.name === "form.submission.received" && row.status !== "delivered");
    return unsettled.length === 0 ? true : undefined;
  } });
}

/** Waits for the pull's background drain to plan the newly imported submission and settle its
 * `form.submission.received` row, then returns the new submission's id. */
export async function awaitNewPlan(required: { kernel: ContentKernel; known: readonly string[] }): Promise<string> {
  const { kernel, known } = required;
  await awaitReceivedSettled({ kernel });
  const fresh = (await plannedSubmissions({ kernel })).filter((id) => !known.includes(id));
  assert.equal(fresh.length, 1, "the pulled submission was planned exactly once");
  return fresh[0]!;
}

/** Wraps the composed automatic pull so a test can wait for each trigger to finish; the real pull
 * still runs. Returns the restore. */
export function countAutoPulls(required: { deps: SiteDeps }): { settled: () => number; restore: () => void } {
  const { deps } = required;
  const real = deps.formSubmissionsAutoPull;
  assert.ok(real, "the real composition wires the automatic pull");
  let settled = 0;
  const counted: FormsAutoPullPort = { run: async (input) => { try { await real.run(input); } finally { settled += 1; } }, drained: () => real.drained() };
  deps.formSubmissionsAutoPull = counted;
  return { settled: () => settled, restore: () => { deps.formSubmissionsAutoPull = real; } };
}
