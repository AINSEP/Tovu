import grapesjs, { type Component, type Editor } from "grapesjs";
import { afterEach, describe, expect, it } from "vitest";
import { detectEditorBlocks, prepareEditorSource, registerProtectedElementType, serializeEditorSource, type PreparedEditorSource } from "@jini-ai/ui/html-editor";
import { createEmbedPlaceholderDescriber, isProtectedEmbedElement } from "../lib/embed-placeholder";
import landing from "./fixtures/landing-scriptblocks.html?raw";

// Real GrapesJS model/parser without iframe render: existing rendered GrapesJS mounts hang under
// jsdom. Browser follow-up must verify RTE isolation, drag/drop, bounded cards and textarea scroll.
const options = { isProtectedElement: isProtectedEmbedElement, describeHostElement: createEmbedPlaceholderDescriber({ t: key => key }) };
const editors: Editor[] = [];
function mount() {
  const sourcePlan = prepareEditorSource({ html: landing }, options);
  if (!sourcePlan.ok) throw new Error(sourcePlan.problem);
  const editor = grapesjs.init({ headless: true, autorender: false, avoidInlineStyle: false, forceClass: false, storageManager: false,
    parser: { optionsHtml: { allowScripts: false, keepEmptyTextNodes: true } },
    components: sourcePlan.html, plugins: [editor => registerProtectedElementType({ editor, sourcePlan }, {})] });
  editors.push(editor);
  return { editor, sourcePlan };
}
afterEach(async () => { await Promise.all(editors.splice(0).map(editor => editor.destroy())); });

function assertSlices(output: string, plan: PreparedEditorSource) {
  const retained = prepareEditorSource({ html: output }, options);
  if (!retained.ok) throw new Error(retained.problem);
  expect(retained.instances.map(instance => instance.originalHtml).sort()).toEqual(plan.instances.map(instance => instance.originalHtml).sort());
  for (const instance of plan.instances) {
    const start = output.indexOf(instance.originalHtml);
    expect(start).toBeGreaterThanOrEqual(0);
    const slice = output.slice(start, start + instance.originalHtml.length);
    expect(slice).toBe(instance.originalHtml);
    expect(Buffer.from(slice).equals(Buffer.from(instance.originalHtml))).toBe(true);
  }
  expect(output).not.toContain(plan.markerAttribute);
  expect(output).not.toContain("data-jini-embed-placeholder-root");
}
function paragraph(editor: Editor, plan: PreparedEditorSource) {
  const detected = detectEditorBlocks({ html: landing }, options);
  if (!detected.ok) throw new Error(detected.problem);
  const candidates: { path: readonly number[]; start: number }[] = [];
  const walk = (elements: typeof detected.elements) => elements.forEach(el => {
    if (el.tagName === "p" && el.path && el.outerRange && !plan.instances.some(raw => el.outerRange!.outerStart >= raw.outerStart && el.outerRange!.outerEnd <= raw.outerEnd)) {
      candidates.push({ path: el.path, start: el.outerRange.outerStart });
    }
    walk([...el.children]);
  });
  walk(detected.elements);
  const candidate = candidates[0]!;
  expect(candidate).toBeDefined();
  let component: Component = editor.getWrapper()!;
  for (const slot of candidate.path) {
    component = component.components().models.filter(c => !c.is("textnode") && !c.is("comment") && !["style", "script"].includes(c.get("sourceTagName")))[slot]!;
  }
  expect(component.tagName).toBe("p");
  return { component, path: candidate.path };
}

describe("Landing scriptblocks exact-source round trip", () => {
  it("moving a Landing section retains ordinary inline styles, gaps and all raw atoms once", () => {
    const { editor, sourcePlan } = mount();
    const wrapper = editor.getWrapper()!;
    const section = wrapper.components().models.find(component => component.getAttributes()['data-od-id'] === 'agents')!;
    expect(section.get('type')).not.toBe('protected-element');
    section.move(wrapper, { at: wrapper.components().length });
    const output = serializeEditorSource({ editor, html: landing, sourcePlan, edits: new Map() }, { structuralChange: 'move' });
    assertSlices(output, sourcePlan);
    expect(output.indexOf('data-od-id="agents"')).toBeGreaterThan(output.indexOf('data-od-id="closer"'));
    expect(output).toContain('style="margin-bottom:0;"');
    expect(output).not.toMatch(/class="[^"]*\bc\d+\b/);
    expect(editor.getCss({ json: true, avoidProtected: true, keepUnusedStyles: true })).toEqual([]);
    expect(output.match(/<style\b/g)).toHaveLength(5);
    expect(output.match(/<script\b/g)).toHaveLength(3);
    for (const atom of sourcePlan.instances.filter(raw => raw.nonvisual)) expect(output.split(atom.originalHtml).length - 1).toBe(1);
    const holder = document.createElement('div');
    holder.innerHTML = landing;
    // Compare gaps inside the unchanged subtree; moving a section joins its former sibling gaps.
    const gaps = Array.from(holder.querySelector('[data-od-id="agents"]')!.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent);
    holder.innerHTML = output;
    expect(Array.from(holder.querySelector('[data-od-id="agents"]')!.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent)).toEqual(gaps);
    expect(holder.querySelector<HTMLElement>('.reel-frame')!.style.getPropertyValue('--reel-ratio')).toBe('1920 / 1258');
  });
  it("selects #adm-ring exactly once and retains all 19 cards as one opaque model", () => {
    const detected = detectEditorBlocks({ html: landing }, options);
    expect(detected.ok).toBe(true);
    if (!detected.ok) return;
    const rings = detected.blocks.filter(block => block.id === "adm-ring");
    expect(rings).toHaveLength(1);
    // Kuinetic text effects (hero headline, ledes, dt/dd, CTA buttons) stay editable, not cards.
    expect(detected.blocks.filter(block => ["h1", "h2", "p", "a", "dt", "dd", "b"].includes(block.tagName))).toEqual([]);
    // Stagger tree/plugs/FAQ lists and border-glow soon cards stay editable. The hero's entrance
    // wrapper also stays editable; its media embed still locks independently.
    expect(detected.blocks.map(block => [block.reason, block.id ?? block.element.attributes.class])).toEqual([
      ["embed", "video-embed"], ["kuinetic", "adm-ring"], ["kuinetic", "deck-shell"], ["kuinetic", "wrap"],
    ]);
    const original = landing.slice(rings[0].outerStart, rings[0].outerEnd);
    expect(original.match(/class="ring-card"/g)).toHaveLength(19);
    const { editor } = mount();
    const ringModels = editor.getWrapper()!.findType("protected-element").filter(c => c.get("sourceId") === "adm-ring");
    expect(ringModels).toHaveLength(1);
    expect(ringModels[0].components().length).toBe(0);
    expect(ringModels[0].toHTML()).toBe(original);
  });
  it("no-op direct/parent/wrapper export retains every slice and authored style/script exactly once", () => {
    const { editor, sourcePlan } = mount();
    const output = serializeEditorSource({ editor, html: landing, sourcePlan, edits: new Map() }, {});
    assertSlices(output, sourcePlan);
    const atoms = sourcePlan.instances.filter(raw => raw.nonvisual);
    expect(atoms.filter(raw => raw.tagName === "style")).toHaveLength(5);
    // The third script belongs to the opaque pin block, already byte-compared by assertSlices.
    expect(atoms.filter(raw => raw.tagName === "script")).toHaveLength(2);
    expect(output.match(/<script\b/g)).toHaveLength(3);
    for (const atom of atoms) expect(output.split(atom.originalHtml).length - 1).toBe(1);
    expect(editor.getCss({ avoidProtected: true })).not.toContain("--x-display");
  });
  it("paragraph text splice preserves the original rest of the Landing body byte-for-byte", () => {
    const { editor, sourcePlan } = mount();
    const { component, path } = paragraph(editor, sourcePlan);
    const before = component.getInnerHTML();
    component.components("Edited paragraph");
    const output = serializeEditorSource({ editor, html: landing, sourcePlan, edits: new Map([[path.join("."), { path, tagName: "p", component }]]) }, {});
    expect(output).toContain("Edited paragraph");
    expect(output).not.toBe(landing);
    expect(component.getInnerHTML()).not.toBe(before);
    assertSlices(output, sourcePlan);
  });
  it.each(["move", "delete"])("%s of an ordinary neighbour forces structural export without changing retained slices", operation => {
    const { editor, sourcePlan } = mount();
    const { component } = paragraph(editor, sourcePlan);
    if (operation === "delete") component.remove();
    else component.move(component.parent()!, { at: component.parent()!.components().length });
    const output = serializeEditorSource({ editor, html: landing, sourcePlan, edits: new Map() }, { structuralChange: operation });
    assertSlices(output, sourcePlan);
  });
});
