import { describe, expect, it } from "vitest";
import { createBundledComposerCapabilitySource } from "../composer-capabilities";
import { projectComposerCapabilities, rankComposerDiscoveryGroups } from "@jini-ai/admin/screens/plugins/composer-capabilities";
import type { ComposerCapability as TovuComposerCapability } from "@jini-ai/admin/screens/plugins/composer-capabilities";

const source = (items: TovuComposerCapability[]) => ({ id: "fixture", list: async () => items });
const row = (id: string, label: string, description = ""): TovuComposerCapability => ({ groupId: id, groupLabel: id, item: { id, label, description } });
const ids = (groups: Awaited<ReturnType<typeof projectComposerCapabilities>>["groups"]) => groups.flatMap(g => g.items.map(i => i.id));

describe("name-first discovery across every source", () => {
  it("labels distinct skill and plugin guidance plainly and keeps the related entries adjacent", async () => {
    const p = await projectComposerCapabilities({ sources: [createBundledComposerCapabilitySource(), source([
      { ...row("installed-skill:skill_ui_ux_design", "ui-ux-design"), item: { id: "installed-skill:skill_ui_ux_design", label: "ui-ux-design", kind: "skill" }, resolve: () => ({ kind: "installed-skill", toolId: "skill_ui_ux_design" }) },
      row("unrelated", "UI editor"),
    ])] });
    const ranked = rankComposerDiscoveryGroups({ groups: p.groups, draft: "/ui" }).flatMap(g => g.items);
    expect(p.byItemId.get("installed-skill:skill_ui_ux_design")?.item.label).toBe("ui-ux-design · Skill");
    expect(p.byItemId.get("agent-plugin:ui-ux-design")?.item.label).toBe("UI/UX Design · Agent plugin");
    expect(ranked.slice(0, 2).map(i => i.id)).toEqual(["installed-skill:skill_ui_ux_design", "agent-plugin:ui-ux-design"]);
    const allIds = ids(rankComposerDiscoveryGroups({ groups: p.groups, draft: "/" }));
    expect(allIds.indexOf("agent-plugin:ui-ux-design")).toBe(allIds.indexOf("installed-skill:skill_ui_ux_design") + 1);
  });
});
