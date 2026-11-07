/**
 * @file Cost-counter baseline, recorded before any move from unmoved code. Counts only, no
 * optimization: each later batch must produce EQUAL counts (a lower count is a behavior change too,
 * and needs the plan's resync rule, not an edit here).
 *
 * - Skill tool call: plugin files opened, read whole, listed, and bytes read per `agent_plugin_<id>` call.
 * - Token lookup: plugin files read (the contribution reload) and credential opens per `getAccessToken`.
 * - Mail send, provider cached / not cached / unconfigured lane: settings reads, credential list calls
 *   and rows, catalog loads and credential opens per send.
 *
 * `moved-tools.golden.json` keeps the MCP-list and plugin-state-write counters; this file adds the
 * rest. Never regenerate except under the resync rule: `COST_COUNTERS_BASELINE_WRITE=1`.
 */
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test, { after, before, type TestContext } from "node:test";

import { AesGcmSecretSealer as PlatformSealer } from "@jini-ai/platform/secrets";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { MailProviderSetting } from "@jini-ai/platform/mail";
import { createAssistantToolExecutor } from "#src/assistant/tool-recovery-preset";
import { installSupportingFilesFixture } from "#src/features/agent-plugins/__tests__/fixtures/supporting-files";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createCustomCredential, InMemoryCustomCredentialSetRepo, type CustomCredentialSetRepoPort } from "#src/features/custom-credentials/index";
import type { MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";
import { createResolvedMailer, type ResolveMailerDeps } from "#src/server/runtime/boot/resolve-mailer";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { PLUGIN, WORKSPACE, compose, connectForRef, startAcmeProvider, stopAcmeProvider } from "./fixtures/acme-provider.js";

const BASELINE_URL = new URL("./fixtures/cost-counters.baseline.json", import.meta.url);
/** The acme-office fixture package `fixtures/acme-provider.ts` loads contributions from. */
const ACME_PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../features/api-connections/__tests__/fixtures/acme-office");
const fsp = createRequire(import.meta.url)("node:fs/promises") as typeof import("node:fs/promises");

type FsCounts = { opened: string[]; readWhole: string[]; listed: number; bytes: number };

/** Counts `node:fs/promises` reads under `root` (ESM bindings re-synced, so the engine's
 *  `import * as fs` sees the wrappers). Paths are recorded relative to `root`, in call order. */
function countFs(t: TestContext, root: string): { counts: FsCounts; stop: () => void } {
  const counts: FsCounts = { opened: [], readWhole: [], listed: 0, bytes: 0 };
  let live = true;
  const under = (p: unknown) => live && typeof p === "string" && path.resolve(p).startsWith(root + path.sep);
  // Content-addressed install folders are normalized to the package's own relative path.
  const rel = (p: string) => path.relative(root, path.resolve(p)).split(path.sep).join("/").replace(/^.*\/package\/sha256\/[0-9a-f]{64}\//, "<package>/");
  const open = fsp.open;
  const readFile = fsp.readFile;
  const readdir = fsp.readdir;
  t.mock.method(fsp, "open", async (...args: Parameters<typeof open>) => {
    const handle = await open(...args);
    if (!under(args[0])) return handle;
    counts.opened.push(rel(args[0] as string));
    const read = handle.read.bind(handle) as (...a: unknown[]) => Promise<{ bytesRead: number }>;
    (handle as unknown as { read: unknown }).read = async (...a: unknown[]) => { const r = await read(...a); counts.bytes += r.bytesRead; return r; };
    const whole = handle.readFile.bind(handle) as (...a: unknown[]) => Promise<string | Buffer>;
    (handle as unknown as { readFile: unknown }).readFile = async (...a: unknown[]) => { const r = await whole(...a); counts.bytes += Buffer.byteLength(r); return r; };
    return handle;
  });
  t.mock.method(fsp, "readFile", async (...args: Parameters<typeof readFile>) => {
    const result = await readFile(...args);
    if (under(args[0])) { counts.readWhole.push(rel(args[0] as string)); counts.bytes += Buffer.byteLength(result); }
    return result;
  });
  t.mock.method(fsp, "readdir", async (...args: Parameters<typeof readdir>) => {
    if (under(args[0])) counts.listed += 1;
    return (readdir as (...a: unknown[]) => Promise<unknown>)(...args);
  });
  syncBuiltinESMExports();
  return { counts, stop: () => { live = false; t.mock.restoreAll(); syncBuiltinESMExports(); } };
}

const sections: Record<string, unknown> = {};

before(startAcmeProvider);
after(stopAcmeProvider);

test("counter: skill tool call (file reads, bytes) per call", async (t) => {
  const fixture = await installSupportingFilesFixture({});
  t.after(fixture.cleanup);
  const executor = createAssistantToolExecutor({ registry: fixture.registry, surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }, {});
  const call = async (input: Record<string, unknown>) => {
    const fs = countFs(t, await fsp.realpath(fixture.root));
    const result = await executor.execute({ principal: { id: "skill-reader" }, run: { id: "run" }, toolId: "agent_plugin_ui_ux_design", input });
    fs.stop();
    assert.equal(result.status, "completed");
    return fs.counts;
  };
  sections.skillToolCall = {
    overview: await call({}),
    supportingFile: await call({ skill: "ui-ux-design", file: "references/foundations.md" }),
    otherSkill: await call({ skill: "frontend-accessibility" }),
  };
});

test("counter: token lookup (contribution reload, credential opens) per getAccessToken", async (t) => {
  const composition = await compose();
  const connectionRef = await connectForRef(composition);
  const tokenOf = () => composition.agentPluginTools.connections.getAccessToken({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionRef });
  await tokenOf();
  // The loader reads each contribution file through a `readFile` bound when the lifecycle was built,
  // so a file-system spy cannot see it; it then parses the file's text. A load is counted as one
  // parse of a contribution file's exact text (no production change).
  const contributionTexts = new Map(["tovu-connections.json", "tovu-agent-tools.json", "tovu-admin-surfaces.json", "tovu-form-destinations.json"]
    .map((name) => [readFileSync(path.join(ACME_PACKAGE_ROOT, name), "utf8"), name] as const));
  const lookup = async () => {
    const loads: string[] = [];
    const parse = JSON.parse;
    t.mock.method(JSON, "parse", (text: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
      const name = typeof text === "string" ? contributionTexts.get(text) : undefined;
      if (name) loads.push(name);
      return parse(text, reviver);
    });
    const opens = t.mock.method(PlatformSealer.prototype, "open");
    const token = await tokenOf();
    const credentialOpens = opens.mock.callCount();
    t.mock.restoreAll();
    assert.equal(typeof token, "string");
    return { contributionLoads: loads, credentialOpens };
  };
  sections.tokenLookup = { first: await lookup(), second: await lookup() };
});

const MAIL_WORKSPACE = "ws-1";
const MAIL_LABEL = "Tovu Mail — Resend API";
const MESSAGE = { workspaceId: MAIL_WORKSPACE, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "hi", text: "hi" };

/** The resolver over counting ports: the same synthetic hosted provider `resolve-mailer.unit.test.ts` uses. */
async function countingMailer(initial: MailProviderSetting) {
  const counts = { settingReads: 0, credentialLists: 0, credentialRows: 0, catalogLoads: 0, credentialOpens: 0, providerCalls: 0 };
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const repo = new InMemoryCustomCredentialSetRepo();
  let n = 0;
  await createCustomCredential({ repo, sealer, keyring, clock: createFakeClock({ startIso: "2026-11-07T00:00:00.000Z" }), idGen: { newId: () => `cred-${++n}` } },
    { workspaceId: MAIL_WORKSPACE, label: MAIL_LABEL, category: "ops", baseUrl: "https://api.resend.com", connection: { token: "fixture-key" } });
  await createCustomCredential({ repo, sealer, keyring, clock: createFakeClock({ startIso: "2026-11-07T00:00:00.000Z" }), idGen: { newId: () => `cred-${++n}` } },
    { workspaceId: MAIL_WORKSPACE, label: "Unrelated key", category: "ops", baseUrl: "https://api.example.test", connection: { token: "other" } });
  const countingRepo: CustomCredentialSetRepoPort = Object.assign(Object.create(repo) as CustomCredentialSetRepoPort, {
    listByWorkspace: async (input: { workspaceId: string }) => { const rows = await repo.listByWorkspace(input); counts.credentialLists += 1; counts.credentialRows += rows.length; return rows; },
  });
  const countingSealer = Object.assign(Object.create(sealer) as AesGcmSecretSealer, {
    open: async (...args: Parameters<AesGcmSecretSealer["open"]>) => { counts.credentialOpens += 1; return sealer.open(...args); },
  });
  const http: HttpClientPort = { send: async (_request: HttpRequest): Promise<HttpResponse> => { counts.providerCalls += 1; return { status: 200, headers: {}, bodyText: "{}" }; } };
  const registry: MailAdapterRegistry = { refusals: [], list: () => [{ pluginId: "fixture-mail", descriptor: {
    schemaVersion: 2, id: "resend", label: "Resend", module: "fake.mjs", credentialLabel: MAIL_LABEL, credentialKeys: ["token"], feedback: false,
  }, module: {
    id: "resend", capabilities: { hosted: true, feedback: false, domainVerification: false },
    create: ({ kit }: { kit: { httpClient: HttpClientPort } }) => ({
      capabilities: () => ({ driver: "resend", supportsIdempotencyKey: true, supportsWebhookFeedback: true, maxBatchSize: 100, supportsAttachments: true }),
      send: async () => { await kit.httpClient.send({ method: "POST", url: "https://mail.example/send", idleTimeoutMs: 1000, headers: {} }); return { ok: true, providerMessageId: "id", acceptedAt: "2026-11-07T00:00:00Z" }; },
      sendBatch: async () => [],
    }),
  } as never }] };
  let value: MailProviderSetting | null = initial;
  const deps: ResolveMailerDeps = {
    providerSetting: { read: async () => { counts.settingReads += 1; return value; }, write: async (next) => { value = next; } },
    log: () => {}, workspaceId: MAIL_WORKSPACE, customCredentialRepo: countingRepo, sealer: countingSealer, httpClient: http, mode: "production",
    loadMailAdapters: async () => { counts.catalogLoads += 1; return registry; },
    createSmtpTransport: () => { throw new Error("SMTP is not selected in this baseline"); }, warn: () => {},
  } as ResolveMailerDeps;
  const resolved = createResolvedMailer(deps);
  await resolved.ready;
  const delta = async (run: () => Promise<unknown>) => {
    const before = { ...counts };
    await run();
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v - before[k as keyof typeof counts]]));
  };
  return { resolved, delta };
}

test("counter: mail send per lane, provider cached and not cached", async () => {
  const send = (resolved: Awaited<ReturnType<typeof countingMailer>>["resolved"], lane: "transactional" | "bulk", key: string) =>
    resolved.mailer.send(MESSAGE, { idempotencyKey: key, workspaceId: MAIL_WORKSPACE, sourceContext: { module: "baseline" }, ...(lane === "bulk" ? { lane } : {}) } as never);
  const hosted = await countingMailer({ transactional: "resend", bulk: "resend" });
  const firstSend = await hosted.delta(() => send(hosted.resolved, "transactional", "k1"));
  const cachedSend = await hosted.delta(() => send(hosted.resolved, "transactional", "k2"));
  hosted.resolved.invalidate();
  const afterInvalidate = await hosted.delta(() => send(hosted.resolved, "transactional", "k3"));
  const unconfigured = await countingMailer({ transactional: null, bulk: null });
  const unconfiguredFirst = await unconfigured.delta(() => send(unconfigured.resolved, "transactional", "u1"));
  const unconfiguredSecond = await unconfigured.delta(() => send(unconfigured.resolved, "transactional", "u2"));
  sections.mailSend = { firstSend, cachedSend, afterInvalidate, unconfiguredFirst, unconfiguredSecond };
});

test("cost counters equal the baseline recorded before any move", () => {
  const json = `${JSON.stringify(sections, null, 2)}\n`;
  if (process.env.COST_COUNTERS_BASELINE_WRITE === "1") writeFileSync(BASELINE_URL, json);
  const baseline = JSON.parse(readFileSync(BASELINE_URL, "utf8")) as Record<string, unknown>;
  const actual = JSON.parse(json) as Record<string, unknown>;
  for (const section of Object.keys(baseline)) assert.deepEqual(actual[section], baseline[section], section);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(baseline).sort());
});
