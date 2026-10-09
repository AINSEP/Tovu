/**
 * Owner report 2026-10-08: typing in the assistant composer lagged in a long conversation. The dock
 * captured every keystroke into its own state, so the whole dock (and `ChatPane`, and the transcript
 * under it) re-rendered per key. The dock only reads two facts from the draft — blank or not, and
 * the leading `/query` — so it must re-render only when one of those changes.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Composer, useComposer, type ComposerDiscoveryGroup } from "@jini-ai/chat/react";
import { useComposerDiscoveryDraft, useSkillOnlySend } from "../hooks/composer-skills.hooks";

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
