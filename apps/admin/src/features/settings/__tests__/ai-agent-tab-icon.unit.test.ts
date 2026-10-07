import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("uses the scaled lucide robot for the AI agent tab in the shared icon frame", () => {
  const source = readFileSync("src/features/settings/SettingsUi.tsx", "utf8");
  const icon = source.split('id: "execution"')[1].split("panel:")[0];
  expect(icon).toContain('<rect x="3" y="6" width="12" height="9" rx="1.5"');
  for (const path of ["M9 6V3H6", "M1.5 10.5h1.5", "M15 10.5h1.5", "M6.75 9.75v1.5", "M11.25 9.75v1.5"]) {
    expect(icon).toContain(`d="${path}"`);
  }
  expect(icon).toContain("<TabIcon>");
});
