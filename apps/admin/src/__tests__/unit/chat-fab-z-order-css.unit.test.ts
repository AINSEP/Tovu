import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";

/**
 * The chat FAB is the top in-page layer (owner, 2026-10-06: "the chatfab should always have the
 * highest z or else the chat sidebar pane will cover it up"). jsdom computes no stacking, so this
 * pins the stylesheet numbers instead: every `z-index` in the admin's own CSS must sit below the
 * FAB's, unless its selector is listed below as a blocking modal (or a popover a modal opens,
 * which has to clear that modal's backdrop). A new sticky bar, sheet, drawer or popover that goes
 * above the FAB fails here; file it as a modal only if it really blocks the page.
 */
const srcRoot = resolve(process.cwd(), "src");

/** Selectors allowed above the FAB, each with the reason it may cover it. */
const ABOVE_FAB = new Map<string, string>([
  [".settings-dialog-backdrop", "shared blocking-modal backdrop (confirm dialogs, pickers)"],
  [".agent-plugin-source-modal", "blocking package-files modal with a backdrop"],
  [".template-source-modal", "blocking template-source modal with a backdrop"],
  [".select-panel.select-panel", "portaled panel opened from WidgetPickerDialog's modal; must clear its backdrop"],
  [".info-tip-bubble", "portaled hint bubble used inside modals; pointer-events: none"],
  [".skip-link", "keyboard-focus skip link, off screen until focused, top-left"],
  [".server-restarting-banner", "server-down status pill, top-centre"],
]);

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

interface Layer {
  file: string;
  selector: string;
  value: string;
}

function zIndexLayers(): Layer[] {
  const layers: Layer[] = [];
  for (const file of cssFiles(srcRoot)) {
    parse(readFileSync(file, "utf8")).walkDecls("z-index", (decl) => {
      const rule = decl.parent;
      if (rule?.type !== "rule") return;
      for (const selector of (rule as unknown as { selectors: string[] }).selectors) {
        layers.push({ file: relative(srcRoot, file), selector, value: decl.value });
      }
    });
  }
  return layers;
}

function fabZIndex(): number {
  const assistant = readFileSync(join(srcRoot, "styles/assistant.css"), "utf8");
  let token: string | undefined;
  parse(assistant).walkDecls("--admin-chat-fab-z", (decl) => {
    token = decl.value;
  });
  return Number(token);
}

describe("chat FAB z-order", () => {
  it("takes its z-index from the --admin-chat-fab-z token", () => {
    const fab = zIndexLayers().filter((layer) => layer.selector === ".chat-fab");
    expect(fab).toEqual([{ file: "styles/assistant.css", selector: ".chat-fab", value: "var(--admin-chat-fab-z)" }]);
    expect(fabZIndex()).toBe(75);
  });

  it("sits above every in-page layer; only blocking modals and their popovers go higher", () => {
    const fab = fabZIndex();
    const above = zIndexLayers()
      .filter((layer) => layer.selector !== ".chat-fab")
      .filter((layer) => {
        const z = Number(layer.value);
        if (!Number.isFinite(z)) throw new Error(`${layer.file} ${layer.selector}: non-numeric z-index "${layer.value}"`);
        return z >= fab;
      })
      .filter((layer) => !ABOVE_FAB.has(layer.selector))
      .map((layer) => `${layer.file} ${layer.selector} z-index: ${layer.value}`);
    expect(above).toEqual([]);
  });

  it("keeps blocking modals above the FAB", () => {
    const fab = fabZIndex();
    const layers = zIndexLayers();
    for (const selector of [".settings-dialog-backdrop", ".agent-plugin-source-modal", ".template-source-modal"]) {
      const values = layers.filter((layer) => layer.selector === selector).map((layer) => Number(layer.value));
      expect(values.length, selector).toBeGreaterThan(0);
      for (const value of values) expect(value, selector).toBeGreaterThan(fab);
    }
  });

  // Doubled class: `@jini-ai/ui/admin-widgets.css` ships `.select-panel { z-index: 50 }` too, and a
  // single-class host rule loses to it whenever the package's <style> tag lands later.
  it("keeps the select panel above the modal backdrop it opens from, at a specificity the package's 50 cannot beat", () => {
    const layers = zIndexLayers();
    const backdrop = Number(layers.find((layer) => layer.selector === ".settings-dialog-backdrop")?.value);
    expect(layers.filter((layer) => layer.selector === ".select-panel")).toEqual([]);
    const panels = layers.filter((layer) => layer.selector === ".select-panel.select-panel").map((layer) => Number(layer.value));
    expect(panels.length).toBeGreaterThan(0);
    for (const panel of panels) expect(panel).toBeGreaterThan(backdrop);
  });
});
