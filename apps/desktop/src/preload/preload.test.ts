/** Speech bridge adoption and host exposure guards for the sites-home preload. */
// Both the site-admin CommonJS preload and sites-home ESM preload expose voice; a namespace
// rename applied to only one leaves that window's mic silently dead. Keep speech-ipc.ts as the
// host channel authority. Reading source keeps these adoption checks usable before a build;
// real contextBridge exposure still requires Electron's preload context.
// Shared bridge rationale: Jini/packages/desktop-host/src/speech/speech-bridge.ts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { register } from "tsx/esm/api";
import ts from "typescript";

import { IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } from "../speech/speech-ipc.ts";
import { RUNNER_APP_VERSION_CHANNEL } from "../contracts/app-version.ts";
import { RUNNER_AGENT_INVENTORY_CHANNELS as INVENTORY } from "../contracts/runtime-inventory.ts";
import { SITE_IPC_CHANNELS as SITE, SITE_THEME_PREVIEW_CHANNELS as THEME } from "../contracts/project.ts";
import { WORKSPACE_CHAT_CHANNELS as CHAT } from "../contracts/workspace-chat.ts";
import { RUNNER_WORKING_DIRECTORY_CHANNELS as WORKDIR } from "../contracts/working-directory.ts";
import { FIND_IN_PAGE_CHANNELS as FIND, FIND_RESULT_CHANNEL } from "../contracts/find-in-page.ts";
import { RUNNER_CHAT_ATTACHMENT_CHANNELS as ATTACHMENT } from "../contracts/chat-attachments.ts";
import { WORKSPACE_CONVERSATION_CHANNELS as CONVERSATION } from "../contracts/workspace-conversations.ts";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = fs.readFileSync(path.join(__dirname, "preload.mts"), "utf8");

test("preload.mts uses the shared speech bridge with the Tovu channel namespace", () => {
  assert.match(source, /createSpeechBridge/);
  assert.match(source, /channelNamespace: 'tovu:speech'/);
  assert.equal(IPC_CHANNEL_IS_AVAILABLE, "tovu:speech:isAvailable");
  assert.equal(IPC_CHANNEL_TRANSCRIBE, "tovu:speech:transcribe");
});

test("preload.mts exposes both bridges — dropping either is what the port had to avoid", () => {
  assert.match(source, /contextBridge\.exposeInMainWorld\(\s*'tovuRunner'/);
  assert.match(source, /contextBridge\.exposeInMainWorld\(\s*'tovuVoice'/);
});

// PARITY: both renderer bridges remain exposed and the ESM voice bridge preserves positional IPC.
test("the ESM preload exposes runner and voice, forwards the exact speech payload, and maps every runner method to its contract channel", async (t) => {
  // Resolve the preload's emitted .js contract paths back to TypeScript source under Node.
  const unregister = register();
  t.after(unregister);
  const exposed = new Map<string, Record<string, (...args: unknown[]) => unknown>>();
  const invokes: unknown[][] = [];
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const availability = { available: true };
  const transcription = { text: "hello", elapsedMs: 7 };
  const frameCalls: unknown[][] = [];
  const file = { name: "photo.png" };
  t.mock.module("electron", {
    namedExports: {
      contextBridge: { exposeInMainWorld: (name: string, bridge: Record<string, (...args: unknown[]) => unknown>) => exposed.set(name, bridge) },
      ipcRenderer: {
        on(channel: string, handler: (...args: unknown[]) => void) {
          if (!listeners.has(channel)) listeners.set(channel, new Set());
          listeners.get(channel)!.add(handler);
        },
        removeListener(channel: string, handler: (...args: unknown[]) => void) { listeners.get(channel)?.delete(handler); },
        invoke: async (channel: string, ...args: unknown[]) => {
        invokes.push([channel, ...args]);
        if (channel === IPC_CHANNEL_IS_AVAILABLE) return availability;
        return channel === IPC_CHANNEL_TRANSCRIBE ? transcription : `reply:${channel}`;
      } },
      webFrame: {
        getZoomLevel: () => { frameCalls.push(["getZoomLevel"]); return 2; },
        setZoomLevel: (level: number) => { frameCalls.push(["setZoomLevel", level]); },
      },
      webUtils: { getPathForFile: (value: unknown) => { frameCalls.push(["getPathForFile", value]); return "/Users/me/photo.png"; } },
    },
  });
  await import("./preload.mts");
  assert.deepEqual([...exposed.keys()], ["tovuRunner", "tovuVoice"]);
  const runner = exposed.get("tovuRunner")!;
  const bridgeSource = ts.createSourceFile("runner-api.ts", fs.readFileSync(path.join(__dirname, "../renderer/runner-api.ts"), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = bridgeSource.statements.find((node): node is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(node) && node.name.text === "RunnerInventoryBridge");
  assert.ok(declaration, "the renderer's bridge contract must be found");
  const expectedKeys = declaration.members.map((member) => member.name!.getText(bridgeSource));
  assert.ok(expectedKeys.length > 30);
  assert.deepEqual(Object.keys(runner).sort(), expectedKeys.sort());
  for (const [method, channel, payload] of [
    ["onFindToggle", "runner:find:toggle", undefined],
    ["onSiteHistory", "runner:sites:history", "back"],
    ["onZoomCommand", "runner:zoom:command", "in"],
  ] as const) {
    const received: unknown[] = [];
    const off = runner[method]!((value: unknown) => received.push(value)) as () => void;
    assert.equal(listeners.get(channel)?.size, 1, `${method} must subscribe to its native channel`);
    for (const handler of listeners.get(channel)!) handler({ sender: "must not cross bridge" }, payload);
    assert.deepEqual(received, [payload]);
    off();
    assert.equal(listeners.get(channel)?.size, 0, `${method} must remove its listener`);
    for (const handler of listeners.get(channel)!) handler({}, payload);
    assert.deepEqual(received, [payload], "no delivery after unsubscribe");
  }
  const voice = exposed.get("tovuVoice")!;
  assert.deepEqual(Object.keys(voice), ["isAvailable", "transcribe"]);
  assert.equal(await voice.isAvailable!(), availability);
  const samples = new Float32Array([0.1, -0.2]);
  assert.equal(await voice.transcribe!(samples, 48000), transcription);
  assert.deepEqual(invokes, [[IPC_CHANNEL_IS_AVAILABLE], [IPC_CHANNEL_TRANSCRIBE, samples, 48000]]);
  assert.equal(invokes[1]![1], samples);
  await assertEveryRunnerMethod({ exposed, invokes, listeners, frameCalls, file });
});

/**
 * Every `tovuRunner` method against the Electron stand-in above. The preload IS the composition edge
 * where Electron is wired in, so Electron is replaced at its module boundary and every assertion is
 * on what crosses that boundary. Runs on the SAME module instance as the test above (a second
 * `import()` would be a second, separately-counted copy of the preload).
 */
async function assertEveryRunnerMethod({ exposed, invokes, listeners, frameCalls, file }: {
  exposed: Map<string, Record<string, (...args: unknown[]) => unknown>>; invokes: unknown[][];
  listeners: Map<string, Set<(...args: unknown[]) => void>>; frameCalls: unknown[][]; file: unknown;
}): Promise<void> {
  const runner = exposed.get("tovuRunner")!;
  assert.ok(Object.isFrozen(runner), "the page must not be able to swap a bridge method");

  const input = { marker: "renderer-input" };
  const cases: [method: string, args: unknown[], expected: unknown[]][] = [
    ["getAppVersion", [], [RUNNER_APP_VERSION_CHANNEL]],
    ["listAgents", [], [INVENTORY.list]],
    ["rescanAgents", [], [INVENTORY.rescan]],
    ["daemonOnline", [], [INVENTORY.daemonOnline]],
    ["listSites", [], [SITE.list]],
    ["rescanSites", [], [SITE.rescan]],
    ["listSiteFolders", [], [SITE.listFolders]],
    ["saveSiteSettings", [input], [SITE.saveSettings, input]],
    ["setSitesHome", [], [SITE.setHome]],
    ["addSiteFolder", [], [SITE.addFolder]],
    ["removeSiteFolder", [{ root: "/r" }], [SITE.removeFolder, { root: "/r" }]],
    ["addSite", [], [SITE.addSite]],
    ["planNewDir", [{ name: "Blog" }], [SITE.planNewDir, { name: "Blog" }]],
    ["createSite", [input], [SITE.create, input]],
    ["listTokenSignInPlugins", [], [SITE.tokenSignInPlugins]],
    ["renameSite", [input], [SITE.rename, input]],
    ["getSitePreview", ["site-1"], [SITE.preview, "site-1"]],
    ["locateSite", ["site-1"], [SITE.locate, "site-1"]],
    ["startSite", ["site-1"], [SITE.start, "site-1"]],
    ["stopSite", ["site-1"], [SITE.stop, "site-1"]],
    ["deleteSite", ["site-1"], [SITE.delete, "site-1"]],
    ["openSiteExternal", [input], [SITE.openExternal, input]],
    ["chatStart", [input], [CHAT.start, input]],
    ["chatReattach", [input], [CHAT.reattach, input]],
    ["chatDetach", ["sub-1"], [CHAT.detach, { subscriptionId: "sub-1" }]],
    ["chatStop", ["run-1"], [CHAT.stop, { runId: "run-1" }]],
    ["chatStatus", ["run-1"], [CHAT.status, { runId: "run-1" }]],
    ["findInPage", [input], [FIND.find, input]],
    ["stopFindInPage", [], [FIND.stop]],
    ["pickWorkingDirectory", ["/cur"], [WORKDIR.pick, "/cur"]],
    ["recentWorkingDirectories", [], [WORKDIR.recent]],
    ["workingDirectoryExists", ["/d"], [WORKDIR.exists, "/d"]],
    ["normalizeWorkingDirectory", ["/d"], [WORKDIR.normalize, "/d"]],
    ["saveChatAttachment", [input], [ATTACHMENT.save, input]],
    ["listConversations", [], [CONVERSATION.list]],
    ["createConversation", [], [CONVERSATION.create]],
    ["renameConversation", [input], [CONVERSATION.rename, input]],
    ["deleteConversation", ["c1"], [CONVERSATION.delete, { id: "c1" }]],
    ["loadConversationMessages", ["c1"], [CONVERSATION.loadMessages, { conversationId: "c1" }]],
    ["saveConversationMessage", [input], [CONVERSATION.saveMessage, input]],
  ];
  for (const [method, args, expected] of cases) {
    invokes.length = 0;
    assert.equal(await runner[method]!(...args), `reply:${expected[0]}`, `${method} resolves main's reply`);
    assert.deepEqual(invokes, [expected], method);
  }

  for (const [method, channel] of [["onChatEvent", CHAT.event], ["onNavigate", CHAT.navigate], ["onFindResult", FIND_RESULT_CHANNEL]] as const) {
    const received: unknown[] = [];
    const off = runner[method]!((value: unknown) => received.push(value)) as () => void;
    for (const handler of listeners.get(channel)!) handler({ sender: "must not cross bridge" }, "payload");
    off();
    assert.deepEqual(received, ["payload"], method);
    assert.equal(listeners.get(channel)!.size, 0, `${method} must remove its listener`);
  }

  assert.equal(runner.getZoomLevel!(), 2);
  runner.setZoomLevel!(1.5);
  assert.equal(runner.getPathForFile!(file), "/Users/me/photo.png");
  assert.deepEqual(frameCalls, [["getZoomLevel"], ["setZoomLevel", 1.5], ["getPathForFile", file]]);

  invokes.length = 0;
  const frames: unknown[] = [];
  const stopWatching = runner.watchSitePreview!({ siteDir: "/s", listener: (frame: unknown) => frames.push(frame) }) as () => void;
  for (const handler of listeners.get(THEME.event)!) handler({ sender: "x" }, { siteDir: "/s", revision: "r1" });
  stopWatching();
  assert.deepEqual(frames, [{ siteDir: "/s", revision: "r1" }]);
  assert.equal(invokes[0]![0], THEME.watch);
  assert.equal(invokes[1]![0], THEME.unwatch);

  const covered = new Set([...cases.map(([method]) => method), "onChatEvent", "onNavigate", "onFindResult", "getZoomLevel", "setZoomLevel",
    "getPathForFile", "watchSitePreview", "onSiteHistory", "onFindToggle", "onZoomCommand"]);
  assert.deepEqual(Object.keys(runner).filter((key) => !covered.has(key)), [], "a new bridge method needs a case here");
}
