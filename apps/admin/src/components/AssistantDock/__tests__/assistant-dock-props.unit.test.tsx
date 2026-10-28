import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { PushToTalkMicButton } from "../../../features/voice-input/PushToTalkMicButton";
import { composerFooterLeading, optionalChatPaneProps, renameActiveConversation, voiceFooterAccessory } from "../assistant-dock-props";
import { FolderPathButton } from "../FolderPathButton";

/**
 * @file The pure prop builders `AssistantDock.tsx` hands to `ChatPane` and its header, on every
 * branch. The dock-level wiring is pinned in `components/__tests__/AssistantDock.unit.test.tsx`
 * ("AssistantDock optional ChatPane props").
 */

describe("optionalChatPaneProps", () => {
  it("passes on each of the four props that holds a value", () => {
    const agents = [{ id: "claude", name: "Claude Code" }];
    const refreshSignal = { loadMessages: vi.fn(async () => []), visibility: document, focus: window };
    expect(optionalChatPaneProps({ agents, conversationId: "conv-1", refreshSignal, composerHistoryScope: "admin-1" }))
      .toEqual({ agents, conversationId: "conv-1", refreshSignal, composerHistoryScope: "admin-1" });
  });

  it("omits every key whose value is empty, rather than passing it as undefined or null", () => {
    expect(optionalChatPaneProps({ agents: undefined, conversationId: null, refreshSignal: undefined, composerHistoryScope: undefined })).toEqual({});
  });

  it("keeps the signed-in admin's history scope in a new chat that has no conversation yet", () => {
    expect(optionalChatPaneProps({ agents: undefined, conversationId: null, refreshSignal: undefined, composerHistoryScope: "admin-1" }))
      .toEqual({ composerHistoryScope: "admin-1" });
  });

  it("treats an empty conversation id and an empty principal id as absent", () => {
    expect(Object.keys(optionalChatPaneProps({ agents: undefined, conversationId: "", refreshSignal: undefined, composerHistoryScope: "" }))).toEqual([]);
  });
});

describe("voiceFooterAccessory", () => {
  it("mounts the push-to-talk button, wired to the transcript sink, when voice input is on", () => {
    const onTranscript = vi.fn();
    const slot = voiceFooterAccessory({ enabled: true, onTranscript });
    expect(isValidElement(slot) && slot.type).toBe(PushToTalkMicButton);
    expect(isValidElement<{ onTranscript: unknown }>(slot) && slot.props.onTranscript).toBe(onTranscript);
  });

  it("omits the slot entirely when voice input is off", () => {
    expect(voiceFooterAccessory({ enabled: false, onTranscript: vi.fn() })).toBeUndefined();
  });
});

describe("renameActiveConversation", () => {
  it("renames the active conversation to the new title", () => {
    const rename = vi.fn(async () => undefined);
    renameActiveConversation({ activeId: "conv-1", rename })("Quarterly report");
    expect(rename).toHaveBeenCalledWith("conv-1", "Quarterly report");
  });

  it("does nothing without an active conversation", () => {
    const rename = vi.fn(async () => undefined);
    expect(renameActiveConversation({ activeId: null, rename })("Quarterly report")).toBeUndefined();
    expect(rename).not.toHaveBeenCalled();
  });
});

describe("composerFooterLeading", () => {
  const picker = { available: true, picking: false, pickFolder: vi.fn() };
  const mic = <span>mic</span>;

  it("passes only the mic (or nothing) through while the folder dialog is unavailable here", () => {
    expect(composerFooterLeading({ folderPicker: { ...picker, available: false }, voice: mic })).toBe(mic);
    expect(composerFooterLeading({ folderPicker: { ...picker, available: false }, voice: undefined })).toBeUndefined();
  });

  it("puts the folder button first, right after +, wired to the picker, then the mic", () => {
    const slot = composerFooterLeading({ folderPicker: { ...picker, picking: true }, voice: mic });
    const children = isValidElement<{ children: unknown[] }>(slot) ? slot.props.children : [];
    const [button, , voice] = children as [unknown, unknown, unknown];
    expect(isValidElement(button) && button.type).toBe(FolderPathButton);
    expect(isValidElement<{ picking: boolean; onPick: unknown }>(button) && [button.props.picking, button.props.onPick]).toEqual([true, picker.pickFolder]);
    expect(voice).toBe(mic);
  });

  it("puts the picked-folder chip after the folder button, before the mic, even with no folder dialog here", () => {
    const chip = <span>chip</span>;
    const children = (slot: unknown) => (isValidElement<{ children: unknown[] }>(slot) ? slot.props.children : []);
    const [button, placed, voice] = children(composerFooterLeading({ folderPicker: picker, voice: mic, pickedFolder: chip })) as [unknown, unknown, unknown];
    expect([isValidElement(button) && button.type, placed, voice]).toEqual([FolderPathButton, chip, mic]);
    expect(children(composerFooterLeading({ folderPicker: { ...picker, available: false }, voice: mic, pickedFolder: chip }))).toEqual([false, chip, mic]);
  });
});
