/**
 * Owner report 2026-10-08: typing in the assistant composer lagged in a long conversation. The dock
 * captured every keystroke into its own state, so the whole dock (and `ChatPane`, and the transcript
 * under it) re-rendered per key. The dock only reads two facts from the draft — blank or not, and
 * the leading `/query` — so it must re-render only when one of those changes.
 */
import { useState } from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Composer, useComposer, type ComposerDiscoveryGroup } from "@jini-ai/chat/react";
import { useSelectedSkills, useComposerDiscoveryDraft, useSkillOnlySend } from "../hooks/composer-skills.hooks";

const catalog: readonly ComposerDiscoveryGroup[] = [
  { id: "skills", label: "Skills", items: [
    { id: "a", label: "alpha", kind: "skill", insertText: "" },
    { id: "b", label: "beta", kind: "skill", insertText: "" },
  ] },
];

function ComposerChild() {
  const composer = useComposer();
  return <Composer composer={composer} onSend={vi.fn()} />;
}

function renderHost() {
  const counter = { renders: 0 };
  function Host() {
    counter.renders += 1;
    const discovery = useComposerDiscoveryDraft(catalog);
    const skillOnly = useSkillOnlySend({ prompt: "alpha", composerHandle: { current: null }, discovery });
    return (
      <div ref={discovery.rootRef} onChangeCapture={discovery.captureDraft}>
        <output data-testid="first-group">{discovery.groups[0]?.items[0]?.label ?? ""}</output>
        <output data-testid="can-send-skills">{String(skillOnly.canSendSkills)}</output>
        <ComposerChild />
      </div>
    );
  }
  render(<Host />);
  return counter;
}

function typeInto(textarea: HTMLElement, text: string) {
  let value = "";
  for (const ch of text) {
    value += ch;
    fireEvent.change(textarea, { target: { value } });
  }
}

it("does not re-render the host on keystrokes that change neither blankness nor the slash query", () => {
  const counter = renderHost();
  const textarea = screen.getByRole("textbox");
  expect(screen.getByTestId("can-send-skills")).toHaveTextContent("true");

  typeInto(textarea, "h");
  const afterFirstChar = counter.renders;
  expect(screen.getByTestId("can-send-skills")).toHaveTextContent("false");

  typeInto(textarea, "hello there, this is a long message");
  expect(counter.renders).toBe(afterFirstChar);

  fireEvent.change(textarea, { target: { value: "" } });
  expect(screen.getByTestId("can-send-skills")).toHaveTextContent("true");
});

it("still re-ranks discovery groups as the slash query changes", () => {
  renderHost();
  const textarea = screen.getByRole("textbox");
  typeInto(textarea, "/be");
  expect(screen.getByTestId("first-group")).toHaveTextContent("beta");
  fireEvent.change(textarea, { target: { value: "/al" } });
  expect(screen.getByTestId("first-group")).toHaveTextContent("alpha");
});

it("reads an empty draft before the host or its composer textarea mounts", () => {
  const { result } = renderHook(() => useComposerDiscoveryDraft(catalog));
  expect(result.current.readDraft()).toBe("");
  act(() => { result.current.rootRef.current = document.createElement("div"); });
  expect(result.current.readDraft()).toBe("");
  act(() => result.current.refreshDraft());
  expect(result.current.draftBlank).toBe(true);
});

it("replaces a selected skill by id while preserving other chips and their order", () => {
  const alpha = { toolId: "alpha", name: "Alpha", guidance: "Alpha guidance" };
  const beta = { toolId: "beta", name: "Beta", guidance: "Beta guidance" };
  const updatedAlpha = { ...alpha, name: "Updated Alpha", guidance: "Updated guidance" };
  const { result } = renderHook(() => useSelectedSkills());
  act(() => { result.current.addSkill(alpha); result.current.addSkill(beta); result.current.addSkill(updatedAlpha); });
  expect(result.current.selectedSkills).toEqual([beta, updatedAlpha]);
  expect(result.current.chips).toEqual([{ pluginRefId: "beta", label: "Beta · Skill" }, { pluginRefId: "alpha", label: "Updated Alpha · Skill" }]);
  expect(result.current.skillOnlyPrompt).toBe("Beta, Updated Alpha");
  act(() => result.current.removeSkill("beta"));
  expect(result.current.selectedSkills).toEqual([updatedAlpha]);
  expect(result.current.chips).toEqual([{ pluginRefId: "alpha", label: "Updated Alpha · Skill" }]);
  expect(result.current.skillOnlyPrompt).toBe("Updated Alpha");
});

it("ignores changes from fields outside the composer", () => {
  function Host() {
    const discovery = useComposerDiscoveryDraft(catalog);
    return <div ref={discovery.rootRef} onChangeCapture={discovery.captureDraft}>
      <output data-testid="blank">{String(discovery.draftBlank)}</output>
      <input aria-label="Other input" />
      <textarea aria-label="Other textarea" />
      <div className="jini-composer"><textarea aria-label="Draft" /></div>
    </div>;
  }
  render(<Host />);
  fireEvent.change(screen.getByLabelText("Other input"), { target: { value: "/be" } });
  fireEvent.change(screen.getByLabelText("Other textarea"), { target: { value: "/be" } });
  expect(screen.getByTestId("blank")).toHaveTextContent("true");
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "hello" } });
  expect(screen.getByTestId("blank")).toHaveTextContent("false");
});

/** A hand-written composer handle keeps the draft and DOM in sync, including an unmount during
 * insertion. The real ChatPane send integration lives in composer-selected-skills.unit.test.tsx. */
function renderSkillSendHost(options: {
  prompt?: string; draft?: string; disabled?: boolean; withHandle?: boolean; rootMounted?: boolean;
  sendButton?: "send" | "stop" | "missing"; removeOnInsert?: "button" | "root";
} = {}) {
  const inserted: string[] = [];
  const sent: string[] = [];
  function Host() {
    const [draft, setDraft] = useState(options.draft ?? "");
    const [insertedOnce, setInsertedOnce] = useState(false);
    const discovery = useComposerDiscoveryDraft(catalog);
    const composerHandle = { current: options.withHandle === false ? null : {
      insertText(text: string) { inserted.push(text); setDraft(text); setInsertedOnce(true); },
    } };
    const only = useSkillOnlySend({ prompt: options.prompt ?? "alpha", composerHandle, discovery });
    const showRoot = options.rootMounted !== false && !(insertedOnce && options.removeOnInsert === "root");
    const showSend = options.sendButton !== "missing" && !(insertedOnce && options.removeOnInsert === "button");
    return <>
      <button onClick={only.sendSkills}>Send skills</button>
      <output data-testid="can-send">{String(only.canSendSkills)}</output>
      {showRoot && <div ref={discovery.rootRef} onChangeCapture={discovery.captureDraft}>
        <div className="jini-composer"><textarea aria-label="Draft" value={draft} disabled={options.disabled} onChange={event => setDraft(event.target.value)} /></div>
        {showSend && <button className={`jini-composer-send${options.sendButton === "stop" ? " jini-composer-send--stop" : ""}`} onClick={() => sent.push(draft)}>Pane action</button>}
      </div>}
    </>;
  }
  render(<Host />);
  return { inserted, sent, send: () => fireEvent.click(screen.getByRole("button", { name: "Send skills" })) };
}

it("does not insert or send when no skills are selected", () => {
  const host = renderSkillSendHost({ prompt: "" });
  host.send();
  expect(screen.getByTestId("can-send")).toHaveTextContent("false");
  expect(screen.getByLabelText("Draft")).toHaveValue("");
  expect(host.inserted).toEqual([]);
  expect(host.sent).toEqual([]);
});

it("preserves a restored user draft instead of replacing it with skill names", () => {
  const host = renderSkillSendHost({ draft: "My restored task" });
  host.send();
  expect(screen.getByTestId("can-send")).toHaveTextContent("false");
  expect(screen.getByLabelText("Draft")).toHaveValue("My restored task");
  expect(host.inserted).toEqual([]);
  expect(host.sent).toEqual([]);
});

it("does not send before the composer's public handle is available", () => {
  const host = renderSkillSendHost({ withHandle: false });
  host.send();
  expect(screen.getByLabelText("Draft")).toHaveValue("");
  expect(host.inserted).toEqual([]);
  expect(host.sent).toEqual([]);
});

it("does not insert into a disabled composer", () => {
  const host = renderSkillSendHost({ disabled: true });
  host.send();
  expect(screen.getByLabelText("Draft")).toHaveValue("");
  expect(host.inserted).toEqual([]);
  expect(host.sent).toEqual([]);
});

it("does not seed or send before the host wrapper mounts", () => {
  const host = renderSkillSendHost({ rootMounted: false });
  host.send();
  expect(host.inserted).toEqual([]);
  expect(host.sent).toEqual([]);
});

it.each(["missing", "stop"] as const)("does not seed a turn when the pane action is %s", sendButton => {
  const host = renderSkillSendHost({ sendButton });
  host.send();
  expect(screen.getByLabelText("Draft")).toHaveValue("");
  expect(host.inserted).toEqual([]);
  expect(host.sent).toEqual([]);
});

it.each(["button", "root"] as const)("does not click a stale send button if insertion removes the %s", removeOnInsert => {
  const host = renderSkillSendHost({ removeOnInsert });
  host.send();
  expect(host.inserted).toEqual(["alpha"]);
  expect(screen.queryByRole("button", { name: "Pane action" })).not.toBeInTheDocument();
  expect(host.sent).toEqual([]);
});
