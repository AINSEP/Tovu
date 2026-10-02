import { describe, expect, it } from "vitest";
import { createBundledComposerCapabilitySource, projectComposerCapabilities, rankComposerDiscoveryGroups } from "../composer-capabilities";
import type { TovuComposerCapability } from "../composer-capabilities";

const source = (items: TovuComposerCapability[]) => ({ id: "fixture", list: async () => items });
const row = (id: string, label: string, description = ""): TovuComposerCapability => ({ groupId: id, groupLabel: id, item: { id, label, description } });
const ids = (groups: Awaited<ReturnType<typeof projectComposerCapabilities>>["groups"]) => groups.flatMap(g => g.items.map(i => i.id));

describe("name-first discovery across every source", () => {
  it.each(["ui", "sk"])("ranks /%s by exact, prefix, word-prefix, substring, then description/keywords", async query => {
    const projection = await projectComposerCapabilities([source([
      row("description", "Word Count", `Built-in ${query} helpers`),
      row("substring", `my${query}helper`), row("word", `design-${query}-helper`),
      row("prefix", `${query}-design`), row("exact", query),
    ])]);
    expect(ids(rankComposerDiscoveryGroups(projection.groups, `/${query}`))).toEqual(["exact", "prefix", "word", "substring", "description"]);
  });
  it("ranks a matching visible name even when its command uses a different alias", async () => {
    const alias = row("alias", "UI");
    const p = await projectComposerCapabilities([source([row("prefix", "ui-helper"), { ...alias, item: { ...alias.item, command: "design" } }])]);
    expect(ids(rankComposerDiscoveryGroups(p.groups, "/ui"))).toEqual(["alias", "prefix"]);
  });
  it("gives ux in ui-ux-design word-prefix priority over a substring", async () => {
    const p = await projectComposerCapabilities([source([row("substring", "luxury"), row("word", "ui-ux-design")])]);
    expect(ids(rankComposerDiscoveryGroups(p.groups, "/ux"))).toEqual(["word", "substring"]);
  });
  it("labels distinct skill and plugin guidance plainly and keeps the related entries adjacent", async () => {
    const p = await projectComposerCapabilities([createBundledComposerCapabilitySource(), source([
      { ...row("installed-skill:skill_ui_ux_design", "ui-ux-design"), item: { id: "installed-skill:skill_ui_ux_design", label: "ui-ux-design", kind: "skill" }, resolve: () => ({ kind: "installed-skill", toolId: "skill_ui_ux_design" }) },
      row("unrelated", "UI editor"),
    ])]);
    const ranked = rankComposerDiscoveryGroups(p.groups, "/ui").flatMap(g => g.items);
    expect(p.byItemId.get("installed-skill:skill_ui_ux_design")?.item.label).toBe("ui-ux-design · Skill");
    expect(p.byItemId.get("agent-plugin:ui-ux-design")?.item.label).toBe("UI/UX Design · Agent plugin");
    expect(ranked.slice(0, 2).map(i => i.id)).toEqual(["installed-skill:skill_ui_ux_design", "agent-plugin:ui-ux-design"]);
    const allIds = ids(rankComposerDiscoveryGroups(p.groups, "/"));
    expect(allIds.indexOf("agent-plugin:ui-ux-design")).toBe(allIds.indexOf("installed-skill:skill_ui_ux_design") + 1);
  });
});
