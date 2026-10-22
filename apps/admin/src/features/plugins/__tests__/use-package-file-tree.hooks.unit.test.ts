import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { applyPackageFileTreeKeyAction, usePackageFileTree } from "../hooks/use-package-file-tree.hooks";

/**
 * @file `usePackageFileTree`'s keyboard handling as a hook (no rendered tree): an empty tree ignores
 * keys, an unmapped key is left to the browser, Enter on a file opens it without moving focus, and
 * arrow navigation works even before the tree element is attached.
 */

function key(name: string) {
  const preventDefault = vi.fn();
  return { event: { key: name, preventDefault } as unknown as KeyboardEvent<HTMLElement>, preventDefault };
}

describe("usePackageFileTree keyboard", () => {
  it("ignores keys while there are no rows", () => {
    const onOpenFile = vi.fn();
    const { result } = renderHook(() => usePackageFileTree({ paths: [], selectedPath: null, onOpenFile }));
    expect(result.current.activePath).toBeNull();
    const press = key("Enter");
    act(() => result.current.onKeyDown(press.event));
    expect(press.preventDefault).not.toHaveBeenCalled();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("leaves an unmapped key to the browser", () => {
    const { result } = renderHook(() => usePackageFileTree({ paths: ["a.md"], selectedPath: null, onOpenFile: vi.fn() }));
    const press = key("x");
    act(() => result.current.onKeyDown(press.event));
    expect(press.preventDefault).not.toHaveBeenCalled();
  });

  it("opens the active file on Enter without moving the active row", () => {
    const onOpenFile = vi.fn();
    const { result } = renderHook(() => usePackageFileTree({ paths: ["a.md", "b.md"], selectedPath: null, onOpenFile }));
    const before = result.current.activePath;
    const press = key("Enter");
    act(() => result.current.onKeyDown(press.event));
    expect(press.preventDefault).toHaveBeenCalled();
    expect(onOpenFile).toHaveBeenCalledWith(before);
    expect(result.current.activePath).toBe(before);
  });

  it("moves the active row with the arrow keys before the tree element is attached", () => {
    const { result } = renderHook(() => usePackageFileTree({ paths: ["a.md", "b.md"], selectedPath: null, onOpenFile: vi.fn() }));
    const first = result.current.activePath;
    act(() => result.current.onKeyDown(key("ArrowDown").event));
    expect(result.current.activePath).not.toBe(first);
    expect(result.current.rows.map((row) => row.node.path)).toContain(result.current.activePath);
  });

  it("expands a collapsed folder with ArrowRight", () => {
    const { result } = renderHook(() => usePackageFileTree({ paths: ["docs/a.md"], selectedPath: null, onOpenFile: vi.fn() }));
    expect(result.current.isExpanded("docs")).toBe(false);
    act(() => result.current.onKeyDown(key("ArrowRight").event));
    expect(result.current.isExpanded("docs")).toBe(true);
  });
});

describe("applyPackageFileTreeKeyAction", () => {
  function effects() {
    return { setExpanded: vi.fn(), openFile: vi.fn(), focus: vi.fn() };
  }

  it("a key that is not the tree's does nothing and leaves the browser default alone", () => {
    const port = effects();
    expect(applyPackageFileTreeKeyAction({}, port)).toBe(false);
    expect(port.setExpanded).not.toHaveBeenCalled();
    expect(port.openFile).not.toHaveBeenCalled();
    expect(port.focus).not.toHaveBeenCalled();
  });

  it("an action that only opens a file opens it without moving focus", () => {
    const port = effects();
    expect(applyPackageFileTreeKeyAction({ open: "skills/a.md" }, port)).toBe(true);
    expect(port.openFile).toHaveBeenCalledWith("skills/a.md");
    expect(port.focus).not.toHaveBeenCalled();
    expect(port.setExpanded).not.toHaveBeenCalled();
  });

  it("an action that only toggles a folder toggles it without moving focus", () => {
    const port = effects();
    expect(applyPackageFileTreeKeyAction({ setExpanded: { path: "skills", expanded: false } }, port)).toBe(true);
    expect(port.setExpanded).toHaveBeenCalledWith("skills", false);
    expect(port.focus).not.toHaveBeenCalled();
    expect(port.openFile).not.toHaveBeenCalled();
  });
});
