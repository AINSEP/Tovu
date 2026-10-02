import { useRef } from "react";
import type { StartRunInput } from "@jini-ai/chat/core";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Composer, useComposer, ChatPane, type ChatPaneComposerHandle } from "@jini-ai/chat/react";
import { deriveConversationTitle } from "@jini-ai/chat/core";
import { projectComposerCapabilities } from "@/features/plugins/composer-capabilities";
import { useComposerDiscoverySelect } from "../hooks/AssistantDock.hooks";
import { useSelectedSkills, useComposerDiscoveryDraft, useSkillOnlySend } from "../hooks/composer-skills.hooks";
import { SelectedAgentPluginTray } from "../SelectedAgentPluginTray";
import { FakeEventSource } from "@/lib/__tests__/assistant-transport.test-helpers";
import { buildLocalCliContextRef, createTovuAssistantTransport } from "@/lib/assistant-transport";

const guidance = 'Use and follow the "ui-ux-design" skill for this task.\n\nKeep focus visible.\n\nRead bundled files with fs_read_file as needed:\n[{"kind":"references","root":"site","path":"skills/ws/workspace-local/ui-ux-design/references/check.md"}]\n\nTask: ';
const makeProjection = () => projectComposerCapabilities([{ id: "fixture", list: async () => [{ groupId: "skills", groupLabel: "Skills", item: { id: "installed-skill:skill_ui_ux_design", label: "ui-ux-design", kind: "skill", insertText: "" }, resolve: () => ({ kind: "installed-skill" as const, toolId: "skill_ui_ux_design" }) }] }]);
afterEach(() => vi.unstubAllGlobals());
const mockGuidance = () => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ skillName: "ui-ux-design", guidance: "Keep focus visible.", bundledFiles: [{ kind: "references", root: "site", path: "skills/ws/workspace-local/ui-ux-design/references/check.md" }] })));

it("pick adds a removable chip, preserves the user's draft, and only the run payload receives guidance", async () => {
  mockGuidance();
  const capabilities = await makeProjection();
  function Harness() {
    const composer = useComposer({ initialDraft: "Redesign the menu" });
    const skills = useSelectedSkills();
    const discovery = useComposerDiscoveryDraft(capabilities.groups);
    const onDiscoverySelect = useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool: vi.fn(), addSkill: skills.addSkill, readDraft: () => composer.draft });
    return <div onChangeCapture={discovery.captureDraft}>
      <SelectedAgentPluginTray chips={skills.chips} onRemove={skills.removeSkill} />
      <output data-testid="payload">{JSON.stringify(buildLocalCliContextRef({ signal: new AbortController().signal, history: [{ id: "u", role: "user", content: composer.draft, createdAt: 1 }], context: { selectedSkills: skills.selectedSkills } }, composer.draft))}</output>
      <Composer composer={composer} onSend={vi.fn()} slots={{ discoveryGroups: discovery.groups, onDiscoverySelect }} />
    </div>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /add context/i }));
  fireEvent.click(screen.getByText("ui-ux-design · Skill"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Remove ui-ux-design · Skill" })).toBeInTheDocument());
  expect(screen.getByRole("textbox")).toHaveValue("Redesign the menu");
  expect(JSON.parse(screen.getByTestId("payload").textContent!).prompt).toBe(`${guidance}Redesign the menu`);
  fireEvent.click(screen.getByRole("button", { name: "Remove ui-ux-design · Skill" }));
  await waitFor(() => expect(JSON.parse(screen.getByTestId("payload").textContent!).prompt).toBe("Redesign the menu"));
});

it("slash selection removes only the query, never pastes guidance, and duplicate picks keep one chip", async () => {
  mockGuidance();
  const capabilities = await makeProjection();
  const { result } = renderHook(() => {
    const skills = useSelectedSkills();
    const select = useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool: vi.fn(), addSkill: skills.addSkill, readDraft: () => "/ui" });
    return { skills, select };
  });
  for (let i = 0; i < 2; i++) await act(async () => {
    expect(await result.current.select({ item: capabilities.byItemId.get("installed-skill:skill_ui_ux_design")!.item, source: "slash" })).toEqual({ draft: "" });
  });
  expect(result.current.skills.chips).toHaveLength(1);
  expect(result.current.skills.selectedSkills[0].guidance).toBe(guidance);
});

it("the title source remains user text while the payload contains skill instructions", async () => {
  mockGuidance();
  const capabilities = await makeProjection();
  const { result } = renderHook(() => {
    const skills = useSelectedSkills();
    const select = useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool: vi.fn(), addSkill: skills.addSkill, readDraft: () => "Redesign the menu" });
    return { skills, select };
  });
  let outcome: { draft?: string } = {};
  await act(async () => { outcome = (await result.current.select({ item: capabilities.byItemId.get("installed-skill:skill_ui_ux_design")!.item, source: "plus" })) ?? {}; });
  expect(outcome).toEqual({ draft: "Redesign the menu" });
  expect(deriveConversationTitle(outcome.draft ?? "")).toBe("Redesign Menu");
  expect(result.current.skills.skillOnlyPrompt).toBe("ui-ux-design");
});

it("the real ChatPane sends a chip-only turn under the skill name, with an empty draft until send", async () => {
  mockGuidance();
  const capabilities = await makeProjection();
  const started = vi.fn(async (_input: StartRunInput) => ({ runId: "run" }));
  function Harness() {
    const skills = useSelectedSkills();
    const discovery = useComposerDiscoveryDraft(capabilities.groups);
    const handle = useRef<ChatPaneComposerHandle | null>(null);
    const only = useSkillOnlySend({ prompt: skills.skillOnlyPrompt, composerHandle: handle, discovery });
    const onDiscoverySelect = useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool: vi.fn(), addSkill: skills.addSkill, readDraft: discovery.readDraft });
    return <div ref={discovery.rootRef} onChangeCapture={discovery.captureDraft}>
      <ChatPane transport={{ startRun: started, reattachRun: async () => {}, fetchRunStatus: async () => null, stopRun: async () => {} }} agents={[{ id: "test", name: "Test" }]} initialSelection={{ agentId: "test" }} composerHandle={handle}
        composerSlots={{ discoveryGroups: discovery.groups, onDiscoverySelect }} runContext={{ selectedSkills: skills.selectedSkills }}
        leadingAccessory={<SelectedAgentPluginTray chips={skills.chips} onRemove={skills.removeSkill} onSendSkills={only.canSendSkills ? only.sendSkills : undefined} />} />
    </div>;
  }
  render(<Harness />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "/ui" } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  const send = await screen.findByRole("button", { name: "Send selected skills" });
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(started).not.toHaveBeenCalled();
  fireEvent.click(send);
  await waitFor(() => expect(started).toHaveBeenCalledOnce());
  const input = started.mock.calls[0][0];
  expect(input.history.find(m => m.role === "user")?.content).toBe("ui-ux-design");
  expect((input.context?.selectedSkills as { guidance: string }[])[0].guidance).toBe(guidance);
  expect(screen.getByRole("textbox")).toHaveValue("");
});

it.each(["ui", "sk"])("the real slash menu puts /%s name matches before description matches", query => {
  const groups = [
    { id: "catalog", label: "Tools", items: [{ id: "word-count", label: "Word Count", description: `Built-in ${query} helpers` }] },
    { id: "skills", label: "Skills", items: [{ id: "skill", label: `${query}-design · Skill`, kind: "skill" }] },
  ];
  function Harness() {
    const composer = useComposer();
    const discovery = useComposerDiscoveryDraft(groups);
    return <div ref={discovery.rootRef} onChangeCapture={discovery.captureDraft}><Composer composer={composer} onSend={vi.fn()} slots={{ discoveryGroups: discovery.groups }} /></div>;
  }
  render(<Harness />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: `/${query}` } });
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(2);
  expect(options[0]).toHaveTextContent(`${query}-design · Skill`);
  expect(options[1]).toHaveTextContent("Word Count");
});

it("dispatch augments the prompt while durable user history remains free of skill instructions", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchRun = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ run: { id: "run" } }));
  vi.stubGlobal("fetch", fetchRun);
  const persistUserTurn = vi.fn(async () => {});
  const transport = createTovuAssistantTransport({ ensureConversationId: async () => "conversation", persistUserTurn, getResumeCapableAgentIds: () => new Set(["test"]) });
  const history = [{ id: "u", role: "user" as const, content: "Redesign the menu" }];
  await transport.startRun({ signal: new AbortController().signal, agentId: "test", history, context: { selectedSkills: [{ toolId: "skill_ui_ux_design", name: "ui-ux-design", guidance }] } }, { onEvent: vi.fn(), onDone: vi.fn(), onError: vi.fn() });
  const body = JSON.parse(fetchRun.mock.calls[0][1]!.body as string);
  expect(JSON.parse(body.contextRef).prompt).toBe(`${guidance}Redesign the menu`);
  expect(persistUserTurn).toHaveBeenCalledWith("conversation", history[0]);
  expect(history[0].content).toBe("Redesign the menu");
});
