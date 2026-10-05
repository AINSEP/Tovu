import { describe, expect, it } from "vitest";
import { draftAfterSkillSelection, promptWithSelectedSkills, selectedSkillsFromContext } from "../selected-skills";

/** Composer skill selections: what survives from host context, and how they reach the prompt. */

const incident = { toolId: "skill_incident", name: "incident", guidance: "Use the incident runbook.\n\nTask: " };
const review = { toolId: "skill_review", name: "review", guidance: "Review carefully.\n\nTask: " };

describe("selectedSkillsFromContext", () => {
  it("keeps only well-formed selections, in order", () => {
    const context = { selectedSkills: [incident, null, "skill", { toolId: 1, name: "x", guidance: "g" }, { toolId: "a", name: 2, guidance: "g" }, { toolId: "a", name: "b" }, review] };
    expect(selectedSkillsFromContext(context)).toEqual([incident, review]);
  });

  it.each([
    ["no context", undefined],
    ["no selection key", {}],
    ["a non-array selection", { selectedSkills: { 0: incident } }],
  ])("is empty for %s", (_label, context) => {
    expect(selectedSkillsFromContext(context as Record<string, unknown> | undefined)).toEqual([]);
  });
});

describe("promptWithSelectedSkills", () => {
  it("prefixes every selected skill's guidance verbatim, separated by a blank line", () => {
    expect(promptWithSelectedSkills("fix the outage", { selectedSkills: [incident, review] }))
      .toBe("Use the incident runbook.\n\nTask: \n\nReview carefully.\n\nTask: fix the outage");
  });

  it("returns the prompt unchanged with no valid selection", () => {
    expect(promptWithSelectedSkills("hello", undefined)).toBe("hello");
    expect(promptWithSelectedSkills("hello", { selectedSkills: [{ toolId: "x" }] })).toBe("hello");
  });
});

describe("draftAfterSkillSelection", () => {
  it("removes only the leading /query and its spacing for slash selections", () => {
    expect(draftAfterSkillSelection("/inci   fix the outage", "slash")).toBe("fix the outage");
    expect(draftAfterSkillSelection("/", "slash")).toBe("");
    expect(draftAfterSkillSelection("fix /inci later", "slash")).toBe("fix /inci later");
  });

  it("keeps the whole draft for plus selections", () => {
    expect(draftAfterSkillSelection("/inci fix", "plus")).toBe("/inci fix");
  });
});
