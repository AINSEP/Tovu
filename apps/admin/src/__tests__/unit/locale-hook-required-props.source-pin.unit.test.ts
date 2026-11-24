import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file P12 #6.T F6.4/F6.7 `default-hook-prop-restored`: the shared mounts take the host locale hook
 * as a REQUIRED prop. A restored default (`= useWiredAdminLocale`) still typechecks — a destructuring
 * default satisfies a required prop type — so this pin reads the sources instead.
 */
const read = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");

const REQUIRED_PROP_MOUNTS = [
  "components/Placeholder.tsx",
  "panels.tsx",
  "App.tsx",
  "features/auth/Login.tsx",
  "integrations/jini-admin/modules.hooks.ts",
  "integrations/jini-admin/comments-module.hooks.ts",
  "integrations/jini-admin/forms-module.hooks.ts",
  "integrations/jini-admin/redirects-module.hooks.ts",
  "integrations/jini-admin/seo-module.hooks.ts",
  "integrations/jini-admin/widgets-module.hooks.ts",
];

describe("shared locale mounts keep a required hook prop", () => {
  it.each(REQUIRED_PROP_MOUNTS)("%s has no defaulted or directly imported live locale hook", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/[Ll]ocaleHook\s*=\s*use\w*AdminLocale/);
    expect(source).not.toContain("hooks/use-admin-locale.hooks");
  });
});
