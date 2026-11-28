/**
 * Final argv sizing of the plugin prompt variants Tovu builds, proven through the real Jini executor.
 *
 * Why this lives here and drives the linked executor: the variant builder only drafts text; which
 * variant actually fits is decided by the executor against the composed (overlay-carrying) argument
 * and the resolved binary's real command line. So the offered content is built by the production
 * `buildPluginPromptVariants`, committed through the production `pluginPromptSelection`, and fitted by
 * the real `createAgentExecutor` launch. Only the OS edges are injected: the spawn port (records argv,
 * never starts a process), the command shell, the launch resolver (no PATH lookup), the model
 * resolver (no CLI probe), and the platform the argv budget is evaluated for.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { ChildProcess } from "node:child_process";
import { createAgentExecutor, createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { createAgentRuntimeBindings, createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createSpawnPort } from "@jini-ai/node-adapters/process";
import type { AgentRuntimePort } from "@jini-ai/daemon/ports/agent-runtime";
import type { PromptAugmenter, RuntimeAgentDef } from "@jini-ai/core/contracts/agents";
import type { AgentPluginGuidanceOffer } from "@jini-ai/core/contracts/site/daemon";
import { createDaemonRuntimePorts } from "../daemon-runtime-ports.js";
import { AGENT_PLUGIN_DISCOVERY_POINTER, buildPluginPromptVariants, pluginPromptSelection, type PluginPromptVariant } from "../agent-plugin-prompt-variants.js";

/** POSIX argv floor the real budget applies for an argv-bound def on a non-Windows platform. */
const LIMIT = 100_000;
const OVERLAY = "HOST OVERLAY";
/** The executor's prepend overlay delivery; asserting the spawned argument against it pins the format. */
const composed = (prompt: string) => `${OVERLAY}\n\n---\n\n${prompt}`;
const bytes = (text: string) => Buffer.byteLength(text, "utf8");
/** Selected history with a multi-byte character, so byte (not character) sizing is what is exercised. */
const BASE_PROMPT = "User: résumé the holographic layout for the landing page";
const SECTION = "## Holography\nUse holographic layout discipline.";
const CATALOG_ROW = "- holography: holographic layout guidance (load_agent_plugin)";

type Commit = { runId: string; offerId: string; deliveredIds: readonly string[] };

function offerOf({ fullPrefix, catalogPrefix }: { fullPrefix: string; catalogPrefix: string }, _optional = {}): AgentPluginGuidanceOffer {
  return { offerId: "offer-1", fullSections: [{ pluginId: "holography", text: SECTION }], fullPrefix, catalogPrefix };
}

/** Pads one prefix so the composed prompt of variant `id` is exactly `target` bytes; assembly is concatenation, so one measurement suffices. */
function padToComposed({ id, target, fullPrefix, catalogPrefix, pinnedPrefix }: {
  id: "full" | "catalog"; target: number; fullPrefix: string; catalogPrefix: string; pinnedPrefix: string;
}, _optional = {}): AgentPluginGuidanceOffer {
  const measure = (offer: AgentPluginGuidanceOffer) => bytes(composed(variantsFor({ offer, pinnedPrefix }).find(v => v.id === id)!.prompt));
  // The catalog is sized from the pointer variant (same base and pin, pointer swapped for catalog rows), so the
  // fixture cannot adapt to a builder that drops the pin from the catalog alone.
  const pointerBased = (offer: AgentPluginGuidanceOffer) => bytes(composed(variantsFor({ offer, pinnedPrefix }).find(v => v.id === "pointer")!.prompt)) - bytes(AGENT_PLUGIN_DISCOVERY_POINTER) + bytes(offer.catalogPrefix);
  const filler = "g".repeat(target - (id === "full" ? measure : pointerBased)(offerOf({ fullPrefix, catalogPrefix })));
  // A full prefix always carries at least the catalog rows plus the inlined section, so it overflows whenever the catalog does.
  const offer = id === "full" ? offerOf({ fullPrefix: fullPrefix + filler, catalogPrefix }) : offerOf({ fullPrefix: `${fullPrefix}\n${catalogPrefix}${filler}`, catalogPrefix: catalogPrefix + filler });
  if (id === "full") assert.equal(measure(offer), target, "fixture sizing");
  return offer;
}

function variantsFor({ offer, pinnedPrefix }: { offer: AgentPluginGuidanceOffer; pinnedPrefix: string }, _optional = {}): PluginPromptVariant[] {
  return buildPluginPromptVariants({ basePrompt: BASE_PROMPT, offer, discoveryPointer: AGENT_PLUGIN_DISCOVERY_POINTER }, { pinnedPrefix });
}

function fakeChild(_required = {}, _optional = {}) {
  const child = Object.assign(new EventEmitter(), { pid: 4242, killed: false, stdout: new EventEmitter(), stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { write: () => true, end: () => {} }), kill: () => true });
  return child;
}

/** One real executor launch of Tovu's variants against an argv-bound, last-position def. */
async function launchVariants({ offer, pinnedPrefix, launchPath }: { offer: AgentPluginGuidanceOffer; pinnedPrefix: string; launchPath: string }, _optional = {}) {
  const variants = variantsFor({ offer, pinnedPrefix });
  const def: RuntimeAgentDef = { id: "fake-aider", name: "Fake Aider", bin: "fake-aider", versionArgs: ["--version"], fallbackModels: [],
    buildArgs: ({ prompt }) => ["--message", prompt], streamFormat: "plain", promptViaStdin: false, maxPromptArgBytes: LIMIT, argvPromptPosition: "last" } as RuntimeAgentDef;
  const spawnCalls: string[][] = [];
  const child = fakeChild();
  const spawn = ((_command: string, args: readonly string[]) => {
    spawnCalls.push([...args]); queueMicrotask(() => child.emit("spawn")); return child as unknown as ChildProcess;
  }) as unknown as Parameters<typeof createSpawnPort>[0]["spawn"];
  const real = createAgentRuntimeBindings({ runtime: createNativeAgentRuntime({ env: {} }) }) satisfies AgentRuntimePort;
  const agentRuntime: AgentRuntimePort = { ...real,
    defs: { ...real.defs, get: ({ id }) => (id === def.id ? def : null) },
    launch: { ...real.launch, applyEnv: ({ env }) => env,
      // The injected platform: the real predicate, evaluated as a POSIX host regardless of where the suite runs.
      promptArgvBudget: (required, optional = {}) => real.launch.promptArgvBudget(required, { ...optional, platform: "linux" }),
      resolve: (() => ({ selectedPath: launchPath, pathResolvedPath: launchPath, configuredOverridePath: null, launchPath, launchKind: "selected", childPathPrepend: [], diagnostic: null })) as unknown as AgentRuntimePort["launch"]["resolve"] },
    models: { ...real.models, resolveForLaunch: (async () => ({ model: "fixture-model", catalog: { models: [{ id: "fixture-model", label: "fixture-model", identityKind: "concrete" }], source: "rpc", freshness: "fresh", fetchedAt: "2026-10-06T00:00:00.000Z", expiresAt: "2026-10-06T00:15:00.000Z", coverage: "observed", launchFingerprint: "fixture", diagnostics: [], defaultSelectionId: "fixture-model" }, resolution: { status: "resolved", id: "fixture-model", source: "rpc", resolvedAt: "2026-10-06T00:00:00.000Z", launchFingerprint: "fixture" } })) as unknown as AgentRuntimePort["models"]["resolveForLaunch"] },
  };
  const runtime = { ...createDaemonRuntimePorts({ hostEnv: {} }), spawn: createSpawnPort({ spawn }), commandShell: { platform: "linux" as const, fallbackComSpec: undefined } };
  const promptAugmenter: PromptAugmenter = { contextKinds: () => [], augmentUserRequest: ({ basePrompt }) => basePrompt, systemOverlay: () => OVERLAY };
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const executor = createAgentExecutor({ lifecycle, hostEnv: {}, runtime, agentRuntime }, { promptAugmenter });
  const commits: Commit[] = [];
  const selection = pluginPromptSelection({ offer, variants, commit: async required => { commits.push({ ...required, deliveredIds: [...required.deliveredIds] }); } });
  const { run } = await lifecycle.start({ contextRef: "ctx" });
  // The launch passes the pinned base as the run prompt, exactly what Tovu's run state carries.
  const base = variants.at(-1)!.prompt;
  const failure = await executor.run({ runId: run.id, agentId: def.id, prompt: base, cwd: process.cwd() }, { argvPromptVariants: selection })
    .then(() => null, (error: unknown) => error);
  if (spawnCalls.length > 0) { child.emit("close", 0, null); await lifecycle.waitForTerminal({ runId: run.id }); }
  return { variants, spawnCalls, commits, failure, runId: run.id };
}

const pick = (variants: readonly PluginPromptVariant[], id: PluginPromptVariant["id"]) => variants.find(v => v.id === id)!.prompt;

test("exact fit inlines full guidance", { timeout: 10_000 }, async () => {
  const offer = padToComposed({ id: "full", target: LIMIT, fullPrefix: SECTION, catalogPrefix: CATALOG_ROW, pinnedPrefix: "" });
  const { variants, spawnCalls, commits, failure, runId } = await launchVariants({ offer, pinnedPrefix: "", launchPath: "/fake/bin/aider" });
  assert.equal(failure, null);
  assert.equal(bytes(spawnCalls[0]!.at(-1)!), LIMIT);
  assert.ok(spawnCalls.length === 1 && spawnCalls[0]!.length === 2 && spawnCalls[0]![1] === composed(pick(variants, "full")), "the full variant is spawned");
  assert.deepEqual(commits, [{ runId, offerId: "offer-1", deliveredIds: ["holography"] }]);
});

test("one byte over falls back to the catalog", { timeout: 10_000 }, async () => {
  const offer = padToComposed({ id: "full", target: LIMIT + 1, fullPrefix: SECTION, catalogPrefix: CATALOG_ROW, pinnedPrefix: "" });
  const { variants, spawnCalls, commits, failure, runId } = await launchVariants({ offer, pinnedPrefix: "", launchPath: "/fake/bin/aider" });
  assert.equal(failure, null);
  assert.ok(spawnCalls.length === 1 && spawnCalls[0]!.length === 2 && spawnCalls[0]![1] === composed(pick(variants, "catalog")), "the catalog variant is spawned");
  assert.deepEqual(commits, [{ runId, offerId: "offer-1", deliveredIds: [] }], "a fallback delivers none of the offered sections");
});

test("Windows quoting expansion is counted", { timeout: 10_000 }, async () => {
  // ~21 KB of quote-heavy guidance (14,000 quotes): well under the byte budget and under the 32,511-char command line as
  // written, but cmd.exe quote-doubling pushes the final command line past it.
  const fullPrefix = `${SECTION}\n${'""a'.repeat(7_000)}`;
  const offer = offerOf({ fullPrefix, catalogPrefix: CATALOG_ROW });
  const { variants, spawnCalls, commits, failure, runId } = await launchVariants({ offer, pinnedPrefix: "", launchPath: "C:\\fake\\aider.cmd" });
  const full = composed(pick(variants, "full"));
  assert.ok(bytes(full) < 32_511, "the unquoted full argument alone fits");
  assert.equal(failure, null);
  assert.equal(spawnCalls.length, 1);
  assert.ok(spawnCalls[0]!.join(" ").includes(CATALOG_ROW), "the catalog variant is the one spawned");
  assert.ok(!spawnCalls[0]!.join(" ").includes('""a""a'));
  assert.deepEqual(commits, [{ runId, offerId: "offer-1", deliveredIds: [] }]);
});

test("catalog overflow uses paged discovery without dropping a pin", { timeout: 10_000 }, async () => {
  const pinnedPrefix = `## Pinned: brand voice\nAlways keep the pinned brand voice. ${"p".repeat(200)}`;
  const offer = padToComposed({ id: "catalog", target: LIMIT + 1, fullPrefix: SECTION, catalogPrefix: CATALOG_ROW, pinnedPrefix });
  const { variants, spawnCalls, commits, failure, runId } = await launchVariants({ offer, pinnedPrefix, launchPath: "/fake/bin/aider" });
  assert.equal(failure, null);
  assert.ok(spawnCalls.length === 1 && spawnCalls[0]!.length === 2 && spawnCalls[0]![1] === composed(pick(variants, "pointer")), "the pointer variant is spawned");
  const spawned = spawnCalls[0]!.at(-1)!;
  assert.ok(spawned.includes(pinnedPrefix), "the pin is never trimmed to make optional text fit");
  assert.ok(spawned.includes(BASE_PROMPT));
  assert.ok(spawned.includes("search_agent_plugin_local starting at offset: 0"));
  assert.ok(!spawned.includes(CATALOG_ROW));
  assert.equal(bytes(composed(pick(variants, "catalog"))), LIMIT + 1, "the rejected catalog kept the pin and was one byte over");
  assert.deepEqual(commits, [{ runId, offerId: "offer-1", deliveredIds: [] }]);
});

test("the executor's cancellation signal is forwarded to the commit, and no signal is invented without one", async () => {
  const seen: Array<{ required: Commit; optional: { signal?: AbortSignal } | undefined }> = [];
  const selection = pluginPromptSelection({ offer: offerOf({ fullPrefix: "full guidance", catalogPrefix: "catalog" }), variants: [],
    commit: async (required, optional) => { seen.push({ required: { ...required, deliveredIds: [...required.deliveredIds] }, optional }); } });
  const controller = new AbortController();
  await selection.onSelected({ runId: "run-signal", id: "full" }, { signal: controller.signal });
  await selection.onSelected({ runId: "run-plain", id: "catalog" });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0]?.required, { runId: "run-signal", offerId: "offer-1", deliveredIds: ["holography"] });
  assert.equal(seen[0]?.optional?.signal, controller.signal);
  assert.deepEqual(seen[1]?.required, { runId: "run-plain", offerId: "offer-1", deliveredIds: [] });
  assert.deepEqual(seen[1]?.optional, {});
});
