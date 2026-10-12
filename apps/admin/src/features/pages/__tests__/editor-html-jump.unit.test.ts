import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorHtmlJump } from "../hooks/use-editor-html-jump.hooks";

const textareas: HTMLTextAreaElement[] = [];
afterEach(() => textareas.splice(0).forEach(node => node.remove()));
const source = '\n<p>before</p>\n<div id="same" data-kui title="a > b"></div>\n<div id="same" data-kui title="a > b"></div>';
function harness(flush: () => Promise<string | undefined> = async () => source, measureCaretTop?: (node: HTMLTextAreaElement, index: number) => number | null) {
  const setView = vi.fn();
  const setDraftHtml = vi.fn();
  const onError = vi.fn();
  const scrollTop = { current: 17 };
  const hook = renderHook(({ revision }) => useEditorHtmlJump({ html: source, contentRevision: revision, flush, setView, setDraftHtml, scrollTop }, { onError, measureCaretTop }), { initialProps: { revision: 1 } });
  return { ...hook, setView, setDraftHtml, onError, scrollTop };
}
describe("locked block Edit HTML navigation", () => {
  it("flushes, selects the exact second opening tag and gives the jump priority over scroll memory", async () => {
    const flush = vi.fn(async () => source);
    const { result, setView, setDraftHtml, scrollTop } = harness(flush);
    await act(async () => { await result.current.requestEditHtml({ occurrenceIndex: 1, tagName: "div", id: "same" }, {}); });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(setView).toHaveBeenCalledWith("html");
    expect(setDraftHtml).toHaveBeenCalledWith(source);
    expect(result.current.consumeJumpFormatting()).toBe(true);
    expect(result.current.consumeJumpFormatting()).toBe(false);
    const node = document.createElement("textarea");
    node.value = source;
    document.body.append(node); textareas.push(node);
    result.current.htmlTextareaRef(node);
    const opening = '<div id="same" data-kui title="a > b">';
    expect(node.selectionStart).toBe(source.lastIndexOf(opening));
    expect(node.selectionEnd).toBe(source.lastIndexOf(opening) + opening.length);
    expect(document.activeElement).toBe(node);
    expect(node.scrollTop).toBe(60);
    expect(scrollTop.current).toBe(60);
  });
  it("scrolls to the measured wrapped position of the tag, not a newline count", async () => {
    const measured: number[] = [];
    const { result, scrollTop } = harness(async () => source, (_node, index) => { measured.push(index); return 900; });
    await act(async () => { await result.current.requestEditHtml({ occurrenceIndex: 1, tagName: "div", id: "same" }, {}); });
    const node = document.createElement("textarea");
    node.value = source;
    document.body.append(node); textareas.push(node);
    result.current.htmlTextareaRef(node);
    expect(measured).toEqual([source.lastIndexOf('<div id="same"')]);
    expect(node.scrollTop).toBe(900);
    expect(scrollTop.current).toBe(900);
  });
  it("ordinary HTML entry restores scroll memory and does not seed a draft", () => {
    const { result, setDraftHtml } = harness();
    const node = document.createElement("textarea");
    node.value = source;
    result.current.htmlTextareaRef(node);
    expect(node.scrollTop).toBe(17);
    expect(setDraftHtml).not.toHaveBeenCalled();
    expect(result.current.consumeJumpFormatting()).toBe(false);
  });
  it("discards an async jump when the external source revision changes", async () => {
    let resolve!: (html: string) => void;
    const { result, rerender, setView, setDraftHtml } = harness(() => new Promise<string>(done => { resolve = done; }));
    let request!: Promise<void>;
    act(() => { request = Promise.resolve(result.current.requestEditHtml({ occurrenceIndex: 0, tagName: "div", id: "same" }, {})); });
    rerender({ revision: 2 });
    await act(async () => { resolve(source); await request; });
    expect(setView).not.toHaveBeenCalled();
    expect(setDraftHtml).not.toHaveBeenCalled();
  });
  it("does not guess a missing occurrence or replace the source on a flush error", async () => {
    const missing = harness();
    await act(async () => { await missing.result.current.requestEditHtml({ occurrenceIndex: 9, tagName: "div", id: "same" }, {}); });
    expect(missing.onError).toHaveBeenCalledTimes(1);
    expect(missing.setView).not.toHaveBeenCalled();
    const failed = harness(async () => { throw new Error("source metadata missing"); });
    await act(async () => { await failed.result.current.requestEditHtml({ occurrenceIndex: 0, tagName: "div" }, {}); });
    expect(failed.onError).toHaveBeenCalledTimes(1);
    expect(failed.setDraftHtml).not.toHaveBeenCalled();
  });
});
