/**
 * @file Composition root for the desktop chat's main-process half — the one call `main.ts` makes.
 *
 * Kept out of `main.ts` so that file's hunk stays one line, and so the wiring itself (which tracked
 * site a renderer-reported `activeSiteDir` resolves to, where the agent's cwd and transcript live) is
 * testable without Electron: every Electron-owned effect arrives as a port.
 */
import path from "node:path";
import { AGENT_DEFS, probeAgentModels, resolveAgentLaunch, runtimeSupportsExternalTools } from "@jini-ai/agent-runtime";
import { createDesktopAgentRuntime, type DesktopAgentRuntime } from "./desktop-agent.ts";
import { buildDesktopAgentTools, UNBUILT_SITE_TOOL_GATEWAY, type SiteToolGateway, type TurnAddressee } from "./desktop-agent-tools.ts";
import { createAgentInventory } from "./desktop-agent-inventory.ts";
import { createConversationStore } from "./workspace-conversation-store.ts";
import { registerWorkspaceChatIpc, WORKSPACE_CHAT_IPC, type ChatIpcMain } from "./workspace-chat-ipc.ts";
import { readTrackedSites } from "./tracked-sites.ts";

interface DesktopChatMainDeps {
  ipcMain: ChatIpcMain;
  userDataDir: string;
  projectsPath: string;
  revealPath: (target: string) => Promise<void>;
  pickDirectory: (currentDirectory?: string) => Promise<string | null>;
  /** Sends one push message to every shell window. */
  broadcast: (channel: string, payload: unknown) => void;
  /** Display name of a tracked site — `main.ts`'s own `readSiteName`. */
  readSiteName: (siteDir: string) => string;
}

/**
 * A renderer-reported site dir resolved against the TRACKED list only. The renderer never gets to
 * name an arbitrary folder as the turn's site. Pure over its ports.
 * @complexity O(n) in the tracked-site count.
 */
function resolveTrackedAddressee(
  siteDir: string,
  ports: { readTracked: () => readonly { siteDir: string }[]; readSiteName: (siteDir: string) => string },
): TurnAddressee | null {
  const resolved = path.resolve(path.sep, siteDir);
  const tracked = ports.readTracked().some((row) => row.siteDir === resolved);
  return tracked ? { siteDir: resolved, name: ports.readSiteName(resolved) } : null;
}

/**
 * Starts the desktop agent and registers every chat channel. Handlers are registered synchronously;
 * the runtime binds its loopback listener in the background and handlers await it.
 *
 * @param deps Electron-owned effects as ports.
 * @param optional `siteTools` — the gateway to the active site's own tools (unbuilt-route default).
 * @returns the runtime promise, for shutdown and for the tool-list evidence the report needs.
 * @complexity O(1) beyond the runtime's own startup.
 */
function startDesktopChat(deps: DesktopChatMainDeps, optional: { siteTools?: SiteToolGateway } = {}): Promise<DesktopAgentRuntime> {
  const runtime = createDesktopAgentRuntime({
    workDir: path.join(deps.userDataDir, "desktop-agent"),
    buildTools: ({ addresseeOf }) => buildDesktopAgentTools({
      sitesToolContext: { userDataDir: deps.userDataDir, projectsPath: deps.projectsPath, revealPath: deps.revealPath },
      addresseeOf,
      siteTools: optional.siteTools ?? UNBUILT_SITE_TOOL_GATEWAY,
      navigate: ({ section }) => deps.broadcast(WORKSPACE_CHAT_IPC.navigate, section),
    }),
  });
  runtime.catch((error: unknown) => console.error("tovu-desktop: the desktop chat agent did not start", error));
  registerWorkspaceChatIpc({
    ipcMain: deps.ipcMain,
    runtime,
    conversations: createConversationStore({ filePath: path.join(deps.userDataDir, "desktop-chat-conversations.json") }),
    resolveAddressee: (siteDir) => resolveTrackedAddressee(siteDir, {
      readTracked: () => readTrackedSites(deps.projectsPath),
      readSiteName: deps.readSiteName,
    }),
    listAgents: createAgentInventory({
      defs: AGENT_DEFS,
      resolveLaunch: resolveAgentLaunch,
      probeModels: probeAgentModels,
      supportsTools: runtimeSupportsExternalTools,
    }),
    pickDirectory: deps.pickDirectory,
  });
  return runtime;
}

export { startDesktopChat, resolveTrackedAddressee };
export type { DesktopChatMainDeps };
